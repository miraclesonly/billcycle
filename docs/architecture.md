# Architecture

## Pull payments through allowances

Soroban tokens implement `approve(from, spender, amount, expiration_ledger)`.
A subscriber approves the Billcycle contract as spender. Each charge calls
`transfer_from(spender = contract, from = subscriber, to = merchant, price)`.

The allowance is the subscriber's **hard cap**: the contract can never pull
more than the subscriber approved, and the subscriber can set it to 0 from
their own wallet at any moment.

## Storage

```text
Plan(id)         → { merchant, token, price, period, active }
Sub(id)          → { plan_id, subscriber, next_charge_at, periods_paid, status }
```

## Charging rules

```text
charge(sub):
  Cancelled            → error
  plan inactive        → error
  now < next_charge_at → NotDue
  try transfer_from ── fails ─▶ status = PastDue, return false   (call still succeeds)
                   └── ok   ─▶ missed = (now − next_charge_at) / period
                               next_charge_at += (missed + 1) × period   (no back-billing)
                               status = Active, return true
```

Using `try_transfer_from` means a failed pull doesn't trap. A keeper that
batches many charges in one transaction isn't reverted by one subscriber
with an empty wallet.

## Why no back-billing?

If the keeper is down for three months, charging three months at once would
surprise the subscriber and could drain an allowance they meant to cover a
year. Billcycle charges one period and moves the schedule forward.
