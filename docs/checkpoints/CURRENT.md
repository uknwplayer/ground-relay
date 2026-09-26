# Current checkpoint

**Local date:** 2026-09-25  
**UTC date:** 2026-09-26  
**Stage:** M7 — Agent Gateway and resume loop  
**Repository:** `uknwplayer/ground-relay`

## Verified product proof

Ground Relay has completed the real physical-Android Anchor escrow path on Solana devnet:

`funded escrow -> mobile wallet claim -> camera evidence -> SHA-256 -> Anchor delivery -> poster acceptance -> worker payout`

Canonical task lifecycle:

`OPEN -> CLAIMED -> DELIVERED -> ACCEPTED -> PAID`

**M5 and M6 are complete.**

## Canonical devnet identity

Program ID:

`6v2peeoZVj2AXfczVLqyMUTHYt3XQPqAxCktpTwjUZap`

Controlled upgrade/deployer/poster address:

`6WG3UpKV9vBRh4XR961eZGpPZcHVGdxqpM3Eten5quuZ`

Do not regenerate the program identity or replace deployment Secrets.

## Canonical physical payout fixture

- task ID: `e335a4ea1f23a002db02f94c371d311b5b46fa908a7f2f6c9f72e60ea122f662`
- task PDA: `7knPNeaZHDn7qVzdGy6Qbq3tWnHMnP2TpHULwLKzVtpT`
- vault PDA: `FGaGmGu8cbYRbdsUubmLDDRNnjic5NutnCM4kFL77bZm`
- poster: `6WG3UpKV9vBRh4XR961eZGpPZcHVGdxqpM3Eten5quuZ`
- worker: `7XY6t1adc9vmuefiEP25TsoEjxRkFhVxT4yQrtN5zr2C`
- worker WSOL account: `2fm8p8DpCeJvcpvNbCpzURRezQthF2z2yQARLgPgZfu6`
- mint: `So11111111111111111111111111111111111111112`
- reward: `1,000,000` atomic units = `0.001 WSOL`
- evidence SHA-256: `7d29069a59aec691ef133d7b7813cdd6e0d4a2ffc807e0887f9a5ad5a59ba802`
- final state: `PAID`

Acceptance signature:

`4QVs7r2xBgSNzZHm8z3N5jbJZKVNCAT4cXEw9pTCqVRv79DchyYDfjnUXUsDJCVWuWFZCZ6WJYE1zTBrDoHSF8Hd`

Worker payout signature:

`4miSuLtKtHANH7Auv52FbQECCyiPc9gQioo5qENWS8izvyeQtHwPgMZad7W9GyGKJ9MzyYyUD8P6pW9qvM92kpEk`

Independent post-payout inspection:

- workflow run: `36207197941`
- status: `paid`
- vault amount: `0`
- worker token amount: `1,000,000`
- evidence hash: exact device match
- invariant checks: PASS

The canonical fixture is historical proof and must not be reset or represented as a fresh OPEN task.

## MWA return hardening

Physical validation exposed a Mobile Wallet Adapter edge case where Solflare can successfully submit a transaction and the Android session can still return `java.util.concurrent.CancellationException` to the app.

Ground Relay now reconciles an ambiguous wallet return against authoritative on-chain state before showing a failure.

Verification:

- CI run: `36207598375`
- Node tests: `6/6` passed
- TypeScript typecheck: passed

## M6 adversarial/lifecycle proof

Isolated workflow:

`M6 devnet settlement guards`

Run ID:

`36208008464`

Result: **PASS**

Devnet rejections/proofs completed:

- wrong worker evidence -> `WrongWorker`
- payout before acceptance -> `InvalidStatus`
- wrong poster acceptance -> `WrongPoster`
- second payout after PAID -> `InvalidStatus`
- worker balance unchanged after rejected second payout
- vault remained zero after rejected second payout
- claim of PAID task -> `InvalidStatus`
- expired claim -> `TaskExpired`
- `cancel_open_task` refunded escrow exactly
- second cancellation -> `InvalidStatus`
- claim of CANCELLED task -> `InvalidStatus`

Cancellation signature:

`3YfiDojJxsmCajYxvcc3HZP2MZ3RVm2vf14VLhtLjw8n4JrzHJ4jb7yqNbzRpgXNqQaKmxUygdovkpwR8hCtE9ZC`

Double-pay guard fixture payout signature:

`5Mg25EWwrSiPhJdibUCThZcKNeRDGUXBzr2H8j6wj4TGqozTpZN5WX1z18yth7CRZGpnXbkr4U7ZhXtLJCrnucnQ`

Detailed record:

`docs/checkpoints/archive/2026-09-26-m6-devnet-guards.md`

## Expiry policy

The demonstrated policy is now explicit:

1. an expired OPEN task becomes unclaimable;
2. the poster cancels it and recovers escrow;
3. a reopen is represented by a new task ID rather than reviving a historical task.

This keeps cancelled/terminal task history immutable.

## Remaining hardening intentionally deferred

`WrongMint` and `EscrowUnderfunded` remain validator defense-in-depth checks and have unit coverage. Correctly initialized legacy-token task/vault state structurally prevents those conditions through the public instruction set.

Task/vault rent reclamation is moved to M8 because it requires a deliberate account-closure/API policy and is not necessary for proving settlement correctness.

## M7 starting state

A prototype Agent Gateway already exists in `gateway/server.mjs` with:

- `POST /v1/tasks`
- task status retrieval
- claim transition
- evidence delivery transition
- verifier acceptance transition
- paid transition
- a resume payload returned after payment

The current gateway is still primarily an in-memory protocol prototype. M7 must turn it into a credible agent-resume loop by adding:

- durable external task ID <-> on-chain task PDA mapping
- idempotency
- authoritative chain synchronization/status
- actual resume callback delivery
- retry/failure semantics
- a seeded end-to-end agent-blocked -> human -> paid -> agent-resumed proof

## Key documents

- `docs/product-anatomy.md`
- `docs/roadmap.md`
- `docs/architecture.md`
- `docs/escrow-protocol.md`
- `docs/openapi.yaml`
- `docs/checkpoints/archive/2026-09-26-mobile-anchor-paid.md`
- `docs/checkpoints/archive/2026-09-26-m6-devnet-guards.md`
- `docs/checkpoints/CURRENT.md`

## Do not repeat

- Do **not** run devnet identity bootstrap again.
- Do **not** regenerate the program keypair.
- Do **not** overwrite deployment GitHub Secrets.
- Do **not** reset/recreate the canonical paid fixture as if it were the same proof.
- Do **not** use old memo receipts as the primary Anchor proof.
- Do **not** commit keys, seed phrases, wallet secrets, or auth tokens.
- Do **not** authorize mainnet deployment from this checkpoint.

## Next recommended action

Continue M7 autonomously by hardening the existing gateway with tests first. The next implementation target is **durable task/PDA mapping plus idempotent settlement/resume callback delivery**. No physical-wallet action is required for that work.
