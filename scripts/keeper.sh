#!/usr/bin/env bash
# Charge every billcycle subscription that is due.
#
#   scripts/keeper.sh <contract-id> <stellar-cli-key> [--network testnet] [--dry-run]
#
# Run it from cron (e.g. hourly). Anyone can call `charge`; the contract only
# moves money for subscriptions that are actually due, so the keeper key needs
# nothing but XLM for fees.
set -euo pipefail

CONTRACT=${1:?usage: keeper.sh <contract-id> <key> [--network NET] [--dry-run]}
SOURCE=${2:?usage: keeper.sh <contract-id> <key> [--network NET] [--dry-run]}
shift 2
NETWORK=testnet
DRY=0
while [ $# -gt 0 ]; do
  case $1 in
    --network) NETWORK=$2; shift 2 ;;
    --dry-run) DRY=1; shift ;;
    *) echo "unknown argument: $1" >&2; exit 1 ;;
  esac
done

inv() { stellar contract invoke --id "$CONTRACT" --source "$SOURCE" --network "$NETWORK" "$@" 2>/dev/null; }

# Newer deployments expose subscription_count; older ones are probed until the first gap.
COUNT=$(inv -- subscription_count | tr -d '"' || true)
if [ -z "$COUNT" ]; then
  COUNT=0
  while inv -- get_subscription --subscription_id $((COUNT + 1)) >/dev/null; do COUNT=$((COUNT + 1)); done
fi

echo "checking $COUNT subscription(s) on $NETWORK"
for ((id = 1; id <= COUNT; id++)); do
  [ "$(inv -- is_due --subscription_id "$id" || echo false)" = "true" ] || continue
  if [ "$DRY" = 1 ]; then
    echo "due: #$id"
  elif result=$(inv --send=yes -- charge --subscription_id "$id"); then
    echo "charged #$id: $result"   # false means it went past due (allowance or balance too low)
  else
    echo "charge #$id failed" >&2
  fi
done
