#!/usr/bin/env bash
set -euo pipefail

PROGRAM_KEYPAIR="${GROUND_RELAY_PROGRAM_KEYPAIR:-}"
if [[ -z "$PROGRAM_KEYPAIR" ]]; then
  echo "Set GROUND_RELAY_PROGRAM_KEYPAIR to a local devnet program keypair path." >&2
  exit 2
fi

if [[ ! -f "$PROGRAM_KEYPAIR" ]]; then
  echo "Program keypair file not found: $PROGRAM_KEYPAIR" >&2
  exit 2
fi

DECLARED_ID="$(sed -n 's/.*declare_id!("\([^"]*\)").*/\1/p' programs/ground-relay/src/lib.rs | head -n1)"
ANCHOR_ID="$(awk '/\[programs.devnet\]/{flag=1;next}/^\[/{flag=0}flag && /ground_relay/{gsub(/[ "]/,"",$3); print $3}' Anchor.toml)"
KEYPAIR_ID="$(solana address -k "$PROGRAM_KEYPAIR")"

echo "declare_id: $DECLARED_ID"
echo "Anchor.toml devnet id: $ANCHOR_ID"
echo "program keypair pubkey: $KEYPAIR_ID"

if [[ "$DECLARED_ID" != "$ANCHOR_ID" || "$DECLARED_ID" != "$KEYPAIR_ID" ]]; then
  echo "Program identity mismatch. Refusing deployment." >&2
  exit 1
fi

echo "Program identity is consistent."
