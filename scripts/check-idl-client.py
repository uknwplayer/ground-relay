#!/usr/bin/env python3
import json
import re
from pathlib import Path

idl = json.loads(Path("idl/ground_relay.json").read_text())
client = Path("src/solana/ground-relay.ts").read_text()

program_id = idl["address"]
if program_id not in client:
    raise SystemExit("Mobile Kit client program ID does not match committed IDL")

def idl_disc(section, name):
    for item in idl[section]:
        if item["name"] == name:
            return item["discriminator"]
    raise SystemExit(f"Missing {section} entry: {name}")

checks = {
    "TASK_ACCOUNT_DISCRIMINATOR": idl_disc("accounts", "TaskEscrow"),
    "CLAIM_TASK_DISCRIMINATOR": idl_disc("instructions", "claim_task"),
    "SUBMIT_EVIDENCE_DISCRIMINATOR": idl_disc("instructions", "submit_evidence"),
    "RELEASE_PAYMENT_DISCRIMINATOR": idl_disc("instructions", "release_payment"),
}

for const_name, expected in checks.items():
    match = re.search(
        rf"{const_name}\s*=\s*new Uint8Array\(\s*\[([^\]]+)\]",
        client,
        flags=re.S,
    )
    if not match:
        raise SystemExit(f"Could not find {const_name} in Kit client")
    actual = [int(value) for value in re.findall(r"\d+", match.group(1))]
    if actual != expected:
        raise SystemExit(
            f"{const_name} mismatch: client={actual}, idl={expected}"
        )
    print(f"{const_name}: PASS")

print("Committed IDL and mobile Kit client are consistent.")
