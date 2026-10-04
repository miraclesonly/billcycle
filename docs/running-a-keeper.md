# Running a keeper

A keeper is any process that calls `charge` when subscriptions are due. It
needs no special rights.

## Minimal loop

1. Index subscription ids from `("sub", "started", plan_id)` events.
2. Every few minutes, for each id, simulate `is_due(id)`.
3. For due ids, submit `charge(id)` (batch several per transaction if you like).
4. Watch `("sub", "pastdue")` events and email the subscriber.

## Recommended allowances

Suggest approving `price × 12` with an expiration about a year of ledgers
out (~6.3M ledgers at ~5s each). That covers a year of billing, and the
subscriber can still revoke at any time.

## Handling PastDue

`PastDue` subscriptions stay chargeable. Retry once a day; when the
subscriber tops up their allowance or balance, the next successful charge
sets them back to `Active` automatically.
