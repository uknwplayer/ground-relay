#!/usr/bin/env bash
set -euo pipefail

if [[ "${GROUND_RELAY_BOOTSTRAP_CONFIRM:-}" != "YES" ]]; then
  echo "Refusing to generate deployment credentials without explicit confirmation." >&2
  echo "Run: GROUND_RELAY_BOOTSTRAP_CONFIRM=YES bash scripts/bootstrap-devnet-codespace.sh" >&2
  exit 2
fi

command -v gh >/dev/null 2>&1 || { echo "GitHub CLI (gh) is required." >&2; exit 2; }

# Codespaces commonly injects a GitHub App token that can push code but cannot
# write Actions secrets. Check the exact permission before generating keypairs.
if ! gh api repos/uknwplayer/ground-relay/actions/secrets/public-key >/dev/null 2>&1; then
  echo "Codespaces token cannot write Actions secrets. Starting one-time GitHub CLI authorization..."
  unset GH_TOKEN GITHUB_TOKEN
  gh auth login --hostname github.com --git-protocol https --web --scopes repo
fi

if ! gh api repos/uknwplayer/ground-relay/actions/secrets/public-key >/dev/null 2>&1; then
  echo "GitHub CLI still lacks permission to write Actions secrets. No keypairs were generated." >&2
  exit 3
fi

if ! command -v solana-keygen >/dev/null 2>&1; then
  echo "Installing Solana CLI 4.1.2..."
  sh -c "$(curl -sSfL https://release.anza.xyz/v4.1.2/install)"
  export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
fi

tmpdir="$(mktemp -d)"
program_keypair="$tmpdir/ground_relay-program.json"
deployer_keypair="$tmpdir/ground_relay-deployer.json"

cleanup() {
  chmod -R u+rw "$tmpdir" 2>/dev/null || true
  rm -rf "$tmpdir"
}
trap cleanup EXIT HUP INT TERM
umask 077

solana-keygen new --no-bip39-passphrase --force --silent -o "$program_keypair" >/dev/null
solana-keygen new --no-bip39-passphrase --force --silent -o "$deployer_keypair" >/dev/null

program_id="$(solana address -k "$program_keypair")"
deployer_id="$(solana address -k "$deployer_keypair")"

echo "New Ground Relay program ID: $program_id"
echo "New devnet deployer: $deployer_id"

# Store private key material directly into GitHub Actions Secrets via stdin.
# The keypair bytes are never printed.
base64 -w0 "$program_keypair" | gh secret set GROUND_RELAY_DEVNET_PROGRAM_KEYPAIR_B64
base64 -w0 "$deployer_keypair" | gh secret set GROUND_RELAY_DEVNET_DEPLOYER_KEYPAIR_B64

python3 - "$program_id" <<'PY'
from pathlib import Path
import re, sys

program_id = sys.argv[1]

lib = Path("programs/ground-relay/src/lib.rs")
text = lib.read_text()
text, n = re.subn(r'declare_id!\("[^"]+"\);', f'declare_id!("{program_id}");', text, count=1)
if n != 1:
    raise SystemExit("Could not update declare_id")
lib.write_text(text)

anchor = Path("Anchor.toml")
text = anchor.read_text()
text = re.sub(
    r'(\[programs\.localnet\]\s*ground_relay\s*=\s*")[^"]+(")',
    rf'\g<1>{program_id}\2',
    text,
    count=1,
)
text = re.sub(
    r'(\[programs\.devnet\]\s*ground_relay\s*=\s*")[^"]+(")',
    rf'\g<1>{program_id}\2',
    text,
    count=1,
)
anchor.write_text(text)
PY

echo "Funding the dedicated deployer on devnet..."
solana config set --url https://api.devnet.solana.com >/dev/null
if solana airdrop 2 "$deployer_id"; then
  echo "Devnet deployer funded."
else
  echo "Automatic airdrop was rate-limited or unavailable."
  echo "Use https://faucet.solana.com with this public address: $deployer_id"
fi

git diff --check
git add Anchor.toml programs/ground-relay/src/lib.rs
git commit -m "adopt controlled devnet program identity"
git push

echo
echo "Bootstrap complete."
echo "Program ID: $program_id"
echo "Deployer: $deployer_id"
echo "GitHub Actions secrets were stored without printing their values."
