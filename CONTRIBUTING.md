# Contributing to Billcycle

Thanks for helping improve Billcycle: a recurring-payments (subscriptions) contract built on capped token allowances.

## Getting set up

You'll need:

- [Rust](https://rustup.rs) (stable) with the `wasm32v1-none` target:
  `rustup target add wasm32v1-none`
- The [Stellar CLI](https://developers.stellar.org/docs/tools/cli) for building and deploying

```bash
git clone https://github.com/miraclesonly/billcycle.git
cd billcycle
```

The [README](./README.md) explains what the project does, and
[`docs/`](./docs) covers the design in more depth.

## Before opening a pull request

Run the same checks CI runs (`.github/workflows/ci.yml`):

```bash
cd contracts
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test
```

- **Add a test** for any new behavior or bug fix, ideally one that fails
  without your change.
- **Keep pull requests focused** on one logical change.
- **Explain the why** in commit messages, not just the what.
- Reference the issue you're fixing with `Closes #123`.

## Reporting bugs and requesting features

Use the issue templates under **New issue**. For security problems, follow
[SECURITY.md](./SECURITY.md) instead of opening a public issue.

## Code of conduct

This project follows the [Code of Conduct](./CODE_OF_CONDUCT.md).
