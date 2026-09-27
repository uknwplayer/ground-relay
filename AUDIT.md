# Ground Relay — Repository Audit Map

This file is the shortest path for an independent reviewer, security scanner, or hackathon judge to audit Ground Relay from source to deployed proof.

## Scope and provenance

- Repository: `https://github.com/uknwplayer/ground-relay`
- Visibility: public
- Default branch: `main`
- Repository created: 2026-09-25 UTC, during the CLOCK IN build window
- Project type: Android worker app + Agent Gateway + Anchor program
- Current chain target: Solana devnet
- License: MIT (`LICENSE`)

No mainnet readiness claim is made by this repository.

## Automated audit discovery

For repository scanners that cache results by commit SHA, use the current `main` head. The root contains `README.md`, `AUDIT.md`, `SECURITY.md`, `LICENSE`, `package.json`, `Cargo.toml`, `Anchor.toml`, source directories, tests, and GitHub Actions workflows. No runtime change is required to make these audit entrypoints discoverable.

## Source map

| Component | Primary source | Responsibility |
| --- | --- | --- |
| Android worker app | `App.tsx`, `src/` | Inbox, wallet connection, task selection, evidence capture, receipts, recovery, payout verification |
| Agent Gateway | `gateway/` | Task discovery, task/PDA binding, Solana synchronization, retryable resume delivery |
| Anchor escrow program | `programs/ground_relay/` | Funded task state machine, canonical PDA constraints, payout/refund/recovery logic |
| Client IDL | `idl/` | Program interface consumed by clients and consistency checks |
| Mobile tests | `test/` | State, reconciliation, payout and regression coverage |
| CI / verification | `.github/workflows/` | Mobile, Gateway, Anchor, SBF/IDL, deployment and proof checks |
| Deployment/proof records | `docs/checkpoints/` | Program identity, task PDAs, transaction signatures, release provenance and physical proof |

## Reproduce the checks

### Mobile app

```bash
npm ci
npm test
npm run typecheck
```

Ground Relay uses Solana Mobile native modules, so Expo Go is not sufficient for the full app path. Android native execution uses:

```bash
npm run android
```

### Agent Gateway

```bash
cd gateway
npm ci
npm test
npm run demo
```

### Anchor workspace

```bash
cargo test --workspace
```

The repository CI also builds and checks the Anchor SBF and generated IDL; see `.github/workflows/`.

## What is authoritative

- Solana is authoritative for a bound task's state and settlement.
- Gateway/cache state is discovery and recovery context only.
- The Gateway does not sign worker settlement transactions.
- Raw evidence photo bytes remain off-chain; a task-bound SHA-256 digest is submitted.
- Mobile actions fail closed when the exact selected on-chain task cannot be verified.
- Ambiguous wallet/network returns are reconciled against chain state rather than replayed optimistically.

## Deployed devnet proof

Program ID:

`6v2peeoZVj2AXfczVLqyMUTHYt3XQPqAxCktpTwjUZap`

ProgramData:

`GKggYJQfNJsZn2EqtuasShdKVPKxWUNbv3zg61UPjJgR`

Fresh hardened physical task PDA:

`BT5sKaBENnaJx1FPmYTtLC7XEojDnVvXpR455cu1Np5y`

Verified lifecycle:

`OPEN -> CLAIMED -> DELIVERED -> ACCEPTED -> PAID`

Reward:

`1,000,000` atomic = `0.001 WSOL`

Payout signature:

`UbpwAKQMUHmFyBGBF9Z7tq76LmS5oHtT8cyA27SG2ZRoWn7Hn4y57HDR9vPhGWNfw3o5deNEHwCeDYVxQYr2Qge`

Independent payout verification confirmed:

- worker WSOL `1,000,000 -> 2,000,000` atomic;
- worker delta `+1,000,000` atomic;
- vault `1,000,000 -> 0` atomic;
- final authoritative task state `PAID`.

See:

- `docs/checkpoints/archive/2026-09-27-m8-physical-paid.md`
- `docs/checkpoints/archive/2026-09-27-m8-complete.md`
- `docs/reviewer-verification.md`

## Release provenance

Verified Android release source commit:

`ffcb9b7d69e159ec05fd11139b02bbb442099299`

Android build run:

`36329825769` — PASS

APK SHA-256:

`cc4074f1dde807f9396e3aaf1a8bdb17d45cbc3bb568fd2ebad2bdfc58e09de4`

The exact APK passed a clean physical Android installation, wallet connection, hosted task discovery, exact-PDA reconciliation and terminal `PAID` readback without replaying a historical transaction.

See `docs/release-candidate.md` and `docs/checkpoints/archive/2026-09-27-m9-release-candidate-device-pass.md`.

## Reliability evidence

A real DNS/RPC outage occurred after wallet submission during the physical payout. The transaction had already reached Solana. The app did not replay the payment; independent verification found `PAID`, and the UI later reconciled safely after network recovery.

Regression evidence:

- RED run `36312405844`
- GREEN run `36312595528`

Consolidated M8 quality sweep:

- run `36313234829` — PASS
- mobile tests `106/106` — PASS
- Gateway tests `63/63` — PASS
- TypeScript typecheck — PASS
- Anchor/Rust workspace tests — PASS
- repository hygiene audit — PASS

## Security boundaries

For the threat model, evidence handling and reporting guidance, see:

- `SECURITY.md`
- `docs/security/evidence-privacy.md`
- `docs/architecture.md`
- `docs/escrow-protocol.md`

## Secrets and signing material

Private signing keys, wallet secrets and deployment credentials are not committed to this repository. CI workflows use temporary environment-provided material where signing is required and remove temporary key files after use.

## Reviewer rule

Treat committed source, CI results, devnet state, transaction signatures and release hashes as evidence. Do not treat cached Gateway state, screenshots alone, or prose claims as transaction authority.
