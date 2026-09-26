#!/usr/bin/env python3
import base64
import json
import struct
import urllib.request

RPC = "https://api.devnet.solana.com"
TASK_PDA = "7knPNeaZHDn7qVzdGy6Qbq3tWnHMnP2TpHULwLKzVtpT"
VAULT_PDA = "FGaGmGu8cbYRbdsUubmLDDRNnjic5NutnCM4kFL77bZm"
EXPECTED_MINT = "So11111111111111111111111111111111111111112"
WORKER_TOKEN = "2fm8p8DpCeJvcpvNbCpzURRezQthF2z2yQARLgPgZfu6"
ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
STATUSES = ["open", "claimed", "delivered", "accepted", "paid", "cancelled"]

def b58encode(raw: bytes) -> str:
    n = int.from_bytes(raw, "big")
    out = ""
    while n:
        n, rem = divmod(n, 58)
        out = ALPHABET[rem] + out
    pad = len(raw) - len(raw.lstrip(b"\0"))
    return "1" * pad + (out or "")

def rpc(method, params):
    payload = json.dumps(
        {"jsonrpc": "2.0", "id": 1, "method": method, "params": params}
    ).encode()
    req = urllib.request.Request(
        RPC, data=payload, headers={"content-type": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=30) as response:
        body = json.load(response)
    if "error" in body:
        raise RuntimeError(body["error"])
    return body["result"]

def account(address):
    value = rpc(
        "getAccountInfo",
        [address, {"encoding": "base64", "commitment": "confirmed"}],
    )["value"]
    if value is None:
        raise SystemExit(f"Account absent: {address}")
    return value, base64.b64decode(value["data"][0])

task_info, task = account(TASK_PDA)
if len(task) < 187:
    raise SystemExit(f"Unexpected task size: {len(task)}")

task_id = task[8:40].hex()
poster = b58encode(task[40:72])
worker = b58encode(task[72:104])
mint = b58encode(task[104:136])
reward = struct.unpack_from("<Q", task, 136)[0]
expires_at = struct.unpack_from("<q", task, 144)[0]
status_index = task[152]
status = STATUSES[status_index] if status_index < len(STATUSES) else f"unknown:{status_index}"
evidence = task[153:185].hex()
if evidence == "0" * 64:
    evidence = None

vault_info, vault = account(VAULT_PDA)
if len(vault) < 72:
    raise SystemExit(f"Unexpected vault size: {len(vault)}")
vault_mint = b58encode(vault[0:32])
vault_authority = b58encode(vault[32:64])
vault_amount = struct.unpack_from("<Q", vault, 64)[0]

worker_token_info, worker_token = account(WORKER_TOKEN)
if len(worker_token) < 72:
    raise SystemExit(f"Unexpected worker token account size: {len(worker_token)}")
worker_token_mint = b58encode(worker_token[0:32])
worker_token_owner = b58encode(worker_token[32:64])
worker_token_amount = struct.unpack_from("<Q", worker_token, 64)[0]

print("Task PDA:", TASK_PDA)
print("Task owner:", task_info["owner"])
print("Task ID:", task_id)
print("Poster:", poster)
print("Worker:", None if worker == "11111111111111111111111111111111" else worker)
print("Mint:", mint)
print("Reward atomic:", reward)
print("Expires at:", expires_at)
print("Status:", status)
print("Evidence hash:", evidence)
print("Vault PDA:", VAULT_PDA)
print("Vault mint:", vault_mint)
print("Vault authority:", vault_authority)
print("Vault amount:", vault_amount)
print("Worker token account:", WORKER_TOKEN)
print("Worker token mint:", worker_token_mint)
print("Worker token owner:", worker_token_owner)
print("Worker token amount:", worker_token_amount)

checks = {
    "mint": mint == EXPECTED_MINT,
    "vault_mint": vault_mint == EXPECTED_MINT,
    "vault_authority": vault_authority == TASK_PDA,
    "worker_token_mint": worker_token_mint == EXPECTED_MINT,
}
print("Invariant checks:", json.dumps(checks, sort_keys=True))
if not all(checks.values()):
    raise SystemExit("On-chain fixture invariant check failed")

print("Task inspection: PASS")
