#!/usr/bin/env bash
set -euo pipefail

PROGRAM_ID="${1:-}"
if [[ -z "$PROGRAM_ID" ]]; then
  PROGRAM_ID="$(sed -n 's/.*declare_id!("\([^"]*\)").*/\1/p' programs/ground-relay/src/lib.rs | head -n1)"
fi

ANCHOR_ID="$(awk '/\[programs.devnet\]/{flag=1;next}/^\[/{flag=0}flag && /ground_relay/{gsub(/[ "]/,"",$3); print $3}' Anchor.toml)"

echo "declare/program id: $PROGRAM_ID"
echo "Anchor.toml devnet id: $ANCHOR_ID"

if [[ "$PROGRAM_ID" != "$ANCHOR_ID" ]]; then
  echo "Program ID mismatch." >&2
  exit 1
fi

RESPONSE="$(curl -sS https://api.devnet.solana.com \
  -H 'content-type: application/json' \
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"getAccountInfo\",\"params\":[\"$PROGRAM_ID\",{\"encoding\":\"base64\",\"commitment\":\"confirmed\"}]}")"

RESPONSE="$RESPONSE" PROGRAM_ID="$PROGRAM_ID" python3 - <<'PY'
import json
import os

program_id = os.environ["PROGRAM_ID"]
data = json.loads(os.environ["RESPONSE"])

if "error" in data:
    raise SystemExit(f"RPC error: {data['error']}")

value = data.get("result", {}).get("value")
print("Program ID:", program_id)

if value is None:
    print("Devnet account: ABSENT")
    raise SystemExit(1)

print("Devnet account: PRESENT")
print("Owner:", value.get("owner"))
print("Executable:", value.get("executable"))
print("Lamports:", value.get("lamports"))

if value.get("executable") is not True:
    raise SystemExit("Program account exists but is not executable")

print("Verification: PASS — account is present and executable on devnet")
PY
