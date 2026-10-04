# Security Policy

Billcycle is a recurring-payments (subscriptions) contract built on capped token allowances. It currently targets **Stellar testnet**; there
is no audited mainnet deployment yet. Treat it accordingly before handling
real funds.

## Reporting a vulnerability

**Please don't open a public issue for security problems.**

1. Open the [Security tab](https://github.com/miraclesonly/billcycle/security) of this repository.
2. Click **Report a vulnerability** to start a private advisory.

Include what's affected, how to reproduce it (a failing test is ideal), and
the impact you expect. You'll get an acknowledgement on the advisory, and
a fix is coordinated there before anything is disclosed.

## What's in scope

Anything in this repository, especially allowance pulls, the once-per-period and no-back-billing rules, cancellation.

## Supported versions

Only the latest commit on `main` is supported. There are no tagged
releases yet, so fixes land on `main`.
