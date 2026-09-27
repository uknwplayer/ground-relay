#!/usr/bin/env bash
set -euo pipefail

PROGRAM_ID="${1:-}"
if [[ -z "$PROGRAM_ID" ]]; then
  PROGRAM_ID="$(sed -n 's/.*declare_id!("\([^"]*\)").*/\1/p' programs/ground-relay/src/lib.rs | head -n1)"
fi

ANCHOR_ID="$(awk '/\[programs.devnet\]/{flag=1;next}/^\[/{flag=0}flag && /ground_relay/{gsub(/[ "]/,"",$3); print $3}' Anchor.toml)"
EXPECTED_PROGRAMDATA="${EXPECTED_PROGRAMDATA:-GKggYJQfNJsZn2EqtuasShdKVPKxWUNbv3zg61UPjJgR}"
EXPECTED_UPGRADE_AUTHORITY="${EXPECTED_UPGRADE_AUTHORITY:-6WG3UpKV9vBRh4XR961eZGpPZcHVGdxqpM3Eten5quuZ}"
DEVNET_RPC_URL="${DEVNET_RPC_URL:-https://api.devnet.solana.com}"

echo "declare/program id: $PROGRAM_ID"
echo "Anchor.toml devnet id: $ANCHOR_ID"

if [[ "$PROGRAM_ID" != "$ANCHOR_ID" ]]; then
  echo "Program ID mismatch." >&2
  exit 1
fi

PROGRAM_ID="$PROGRAM_ID" \
EXPECTED_PROGRAMDATA="$EXPECTED_PROGRAMDATA" \
EXPECTED_UPGRADE_AUTHORITY="$EXPECTED_UPGRADE_AUTHORITY" \
DEVNET_RPC_URL="$DEVNET_RPC_URL" \
python3 - <<'PY'
import base64
import json
import os
import struct
import urllib.request

ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
LOADER = "BPFLoaderUpgradeab1e11111111111111111111111"

program_id = os.environ["PROGRAM_ID"]
expected_programdata = os.environ["EXPECTED_PROGRAMDATA"]
expected_authority = os.environ["EXPECTED_UPGRADE_AUTHORITY"]
rpc_url = os.environ["DEVNET_RPC_URL"]


def b58encode(raw: bytes) -> str:
    leading = 0
    for byte in raw:
        if byte != 0:
            break
        leading += 1
    value = int.from_bytes(raw, "big")
    encoded = ""
    while value:
        value, remainder = divmod(value, 58)
        encoded = ALPHABET[remainder] + encoded
    return "1" * leading + encoded


def rpc(method, params):
    payload = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode()
    request = urllib.request.Request(
        rpc_url,
        data=payload,
        headers={"content-type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        data = json.loads(response.read())
    if "error" in data:
        raise SystemExit(f"RPC error: {data['error']}")
    return data["result"]


def account(pubkey):
    result = rpc("getAccountInfo", [pubkey, {"encoding": "base64", "commitment": "confirmed"}])
    value = result.get("value")
    if value is None:
        raise SystemExit(f"Devnet account absent: {pubkey}")
    raw = base64.b64decode(value["data"][0])
    return result.get("context", {}).get("slot"), value, raw


context_slot, program, program_raw = account(program_id)
print("Program ID:", program_id)
print("Devnet account: PRESENT")
print("Owner:", program.get("owner"))
print("Executable:", program.get("executable"))
print("Lamports:", program.get("lamports"))
print("RPC confirmed context slot:", context_slot)

if program.get("owner") != LOADER:
    raise SystemExit(f"Unexpected program owner: {program.get('owner')}")
if program.get("executable") is not True:
    raise SystemExit("Program account exists but is not executable")
if len(program_raw) < 36 or struct.unpack_from("<I", program_raw, 0)[0] != 2:
    raise SystemExit("Program account is not an UpgradeableLoader Program state")

programdata = b58encode(program_raw[4:36])
print("ProgramData address:", programdata)
if programdata != expected_programdata:
    raise SystemExit(
        f"ProgramData mismatch: expected {expected_programdata}, observed {programdata}"
    )

_, programdata_account, programdata_raw = account(programdata)
if programdata_account.get("owner") != LOADER:
    raise SystemExit(f"Unexpected ProgramData owner: {programdata_account.get('owner')}")
if len(programdata_raw) < 13 or struct.unpack_from("<I", programdata_raw, 0)[0] != 3:
    raise SystemExit("Account is not an UpgradeableLoader ProgramData state")

last_deployed_slot = struct.unpack_from("<Q", programdata_raw, 4)[0]
authority_tag = programdata_raw[12]
if authority_tag == 0:
    authority = None
elif authority_tag == 1:
    if len(programdata_raw) < 45:
        raise SystemExit("ProgramData authority encoding is truncated")
    authority = b58encode(programdata_raw[13:45])
else:
    raise SystemExit(f"Unexpected ProgramData authority option tag: {authority_tag}")

print("ProgramData owner:", programdata_account.get("owner"))
print("ProgramData data length:", len(programdata_raw))
print("Last deployed slot:", last_deployed_slot)
print("Upgrade authority:", authority or "None")

if authority != expected_authority:
    raise SystemExit(
        f"Upgrade authority mismatch: expected {expected_authority}, observed {authority}"
    )

print("Verification: PASS — executable program, canonical ProgramData, slot, and upgrade authority match devnet expectations")
PY
