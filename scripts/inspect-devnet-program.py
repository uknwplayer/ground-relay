#!/usr/bin/env python3
import base64, datetime, json, struct, sys, urllib.request

RPC = "https://api.devnet.solana.com"
PROGRAM_ID = sys.argv[1] if len(sys.argv) > 1 else "6v2peeoZVj2AXfczVLqyMUTHYt3XQPqAxCktpTwjUZap"

ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"

def b58encode(raw: bytes) -> str:
    n = int.from_bytes(raw, "big")
    out = ""
    while n:
        n, r = divmod(n, 58)
        out = ALPHABET[r] + out
    pad = len(raw) - len(raw.lstrip(b"\0"))
    return "1" * pad + (out or "")

def rpc(method, params):
    body = json.dumps({"jsonrpc":"2.0","id":1,"method":method,"params":params}).encode()
    req = urllib.request.Request(RPC, data=body, headers={"content-type":"application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        data = json.load(r)
    if "error" in data:
        raise RuntimeError(data["error"])
    return data["result"]

info = rpc("getAccountInfo", [PROGRAM_ID, {"encoding":"base64","commitment":"confirmed"}])["value"]
if info is None:
    raise SystemExit("Program account is absent")

program_raw = base64.b64decode(info["data"][0])
if len(program_raw) < 36:
    raise SystemExit(f"Unexpected program account data length: {len(program_raw)}")
tag = struct.unpack_from("<I", program_raw, 0)[0]
if tag != 2:
    raise SystemExit(f"Unexpected upgradeable-loader program tag: {tag}")
programdata_id = b58encode(program_raw[4:36])

pdata = rpc("getAccountInfo", [programdata_id, {"encoding":"base64","commitment":"confirmed"}])["value"]
if pdata is None:
    raise SystemExit("ProgramData account is absent")
pdata_raw = base64.b64decode(pdata["data"][0])
ptag = struct.unpack_from("<I", pdata_raw, 0)[0]
if ptag != 3:
    raise SystemExit(f"Unexpected ProgramData tag: {ptag}")
slot = struct.unpack_from("<Q", pdata_raw, 4)[0]
has_authority = pdata_raw[12]
authority = b58encode(pdata_raw[13:45]) if has_authority else None

sigs = rpc("getSignaturesForAddress", [PROGRAM_ID, {"limit":10,"commitment":"confirmed"}])

print(f"Program ID: {PROGRAM_ID}")
print(f"Program owner: {info['owner']}")
print(f"Executable: {info['executable']}")
print(f"ProgramData: {programdata_id}")
print(f"ProgramData owner: {pdata['owner']}")
print(f"Last deployed slot: {slot}")
print(f"Upgrade authority: {authority or 'None (immutable)'}")
print("Recent program-address signatures:")
for item in sigs:
    bt = item.get("blockTime")
    iso = datetime.datetime.fromtimestamp(bt, datetime.timezone.utc).isoformat() if bt else "unknown"
    print(f"- {item['signature']} | {iso} | err={item.get('err')}")
