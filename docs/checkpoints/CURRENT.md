# Current checkpoint

**Local date:** 2026-09-26  
**UTC date:** 2026-09-26  
**Stage:** M8 — product hardening  
**Repository:** `uknwplayer/ground-relay`

## Current state

Ground Relay has now proven both halves of the product thesis:

1. a real physical Android worker can complete and settle a funded Anchor task on Solana devnet;
2. a non-custodial Agent Gateway can durably correlate that task to an originating agent and deliver an idempotent resume event only after authoritative PAID settlement.

Combined target loop:

`agent blocked -> funded task -> worker claims -> camera evidence -> verifier accepts -> escrow pays worker -> verified agent resume callback`

**M5, M6, and M7 are complete and M7 is merged into `main`. M8 is now active.**

## Canonical devnet identity

Program ID:

`6v2peeoZVj2AXfczVLqyMUTHYt3XQPqAxCktpTwjUZap`

Controlled upgrade/deployer/poster address:

`6WG3UpKV9vBRh4XR961eZGpPZcHVGdxqpM3Eten5quuZ`

Do not regenerate the program identity or replace deployment Secrets.

## Canonical physical payout proof

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

Detailed record:

`docs/checkpoints/archive/2026-09-26-mobile-anchor-paid.md`

The canonical fixture is historical proof and must not be reset or represented as a fresh OPEN task.

## Mobile wallet return hardening

Physical validation exposed a Mobile Wallet Adapter edge case where Solflare can successfully submit a transaction and the Android session can still return `java.util.concurrent.CancellationException` to the app.

Ground Relay reconciles ambiguous wallet returns against authoritative on-chain state before showing failure.

Verification:

- CI run: `36207598375`
- Node tests: `6/6` passed
- TypeScript typecheck: passed

## M6 settlement/lifecycle hardening

Isolated devnet workflow:

`M6 devnet settlement guards`

Run:

`36208008464`

Verified:

- wrong worker evidence -> rejected
- wrong poster acceptance -> rejected
- payout before acceptance -> rejected
- second payout after PAID -> rejected with balances unchanged
- claim of PAID task -> rejected
- expired claim -> rejected
- `cancel_open_task` -> exact escrow refund
- second cancellation -> rejected
- claim of CANCELLED task -> rejected

Detailed record:

`docs/checkpoints/archive/2026-09-26-m6-devnet-guards.md`

Expiry/reopen policy:

1. expired OPEN task is unclaimable;
2. poster cancels/refunds it;
3. reopening creates a new task ID instead of reviving terminal history.

## M7 Agent Gateway proof

M7 replaced the in-memory Gateway prototype with a restart-safe, non-custodial reference service.

Implemented and tested:

- versioned atomic JSON state persistence;
- durable external task ID <-> Solana task PDA/post signature binding;
- Ground Relay Anchor account decoder and owner/layout validation;
- authoritative chain synchronization for bound tasks;
- monotonic/terminal state protection against stale reads;
- duplicate task-PDA binding rejection;
- idempotent task creation;
- required callback URL for new M7 tasks;
- deterministic resume event ID and idempotency key;
- verified PAID settlement notification rather than client-authoritative payment state;
- actual HTTP agent resume delivery;
- retry classification and persisted +1/+2/+4/+8/+16 second backoff;
- restart recovery for pending retries;
- manual retry with stable event identity;
- bound tasks reject legacy local mutations with `chain_authoritative`;
- seeded restart demo proving acknowledged callbacks are not duplicated;
- repeated `/paid` notification redelivers an unacknowledged logical event without changing its identity.

Final branch verification:

- branch HEAD: `aa664f389482fc66039fb21d196e0a26749cd36a`
- Gateway check run: `36213994673`
- `npm ci`: PASS
- Gateway tests: **49/49 PASS**
- seeded demo: **PASS**
- duplicate callback after restart: `false`

M7 integration:

- pull request: `#2`
- merge method: squash
- `main` commit: `42231293ed787d367d0db9d4e183daed6e9f979c`
- post-merge Gateway check run: `36249541738`
- post-merge result: **PASS**

Seeded event ID:

`4deaf25af94d670a6d27317c6e128e5f8eff0779aabbe41fa22df19a1e3595a5`

Seeded idempotency key:

`ground-relay:seeded-agent-blocker:paid:seeded-settlement-signature`

Detailed record:

`docs/checkpoints/archive/2026-09-26-m7-agent-resume.md`

## M7 trust model

The Gateway is non-custodial.

It does not persist or require poster/worker private keys for its deterministic CI/demo. It stores only public/task protocol metadata, signatures, hashes, task/PDA binding data, callback URLs, and callback delivery metadata.

After binding, the Solana account is authoritative for worker/status/evidence/mint/reward identity. `POST /paid` is a reconciliation trigger; it cannot make an unpaid chain task paid.

Resume semantics are:

**one logical event, at-least-once HTTP transport until acknowledgement**.

A successful `2xx` acknowledgement is persisted and prevents automatic resend after restart.

## M8 working state

M8 is the active milestone.

The first product-hardening slice is:

1. task inbox backed by real task data;
2. app restart/state restoration;
3. receipt/history screen over restored authoritative task state.

Follow-on M8 work includes deep-link/QR handoff where useful, callback/SSRF hardening, evidence privacy review, account/payment security review, terminal account rent reclamation policy, and removal or explicit labeling of remaining demo-only behavior.

M8 work should proceed in an isolated branch from the verified M7 `main` state. No mainnet deployment is authorized.

## Key documents

- `docs/product-anatomy.md`
- `docs/roadmap.md`
- `docs/architecture.md`
- `docs/escrow-protocol.md`
- `docs/openapi.yaml`
- `docs/superpowers/specs/2026-09-25-agent-gateway-resume-design.md`
- `docs/superpowers/plans/2026-09-25-agent-gateway-resume.md`
- `docs/checkpoints/archive/2026-09-26-mobile-anchor-paid.md`
- `docs/checkpoints/archive/2026-09-26-m6-devnet-guards.md`
- `docs/checkpoints/archive/2026-09-26-m7-agent-resume.md`
- `docs/checkpoints/CURRENT.md`

## Do not repeat

- Do **not** run devnet identity bootstrap again.
- Do **not** regenerate the program keypair.
- Do **not** overwrite deployment GitHub Secrets.
- Do **not** reset/recreate the canonical paid fixture as if it were the same proof.
- Do **not** use old memo receipts as the primary Anchor proof.
- Do **not** commit keys, seed phrases, wallet secrets, or auth tokens.
- Do **not** make the Agent Gateway a custodial signer merely to simplify M8.
- Do **not** describe HTTP callback delivery as exactly-once transport.
- Do **not** authorize mainnet deployment from this checkpoint.

## Next recommended action

Start M8 in an isolated branch and design the first hardening slice around a real-data task inbox plus deterministic app restart/state restoration. Keep Solana state authoritative and preserve the canonical paid fixture as historical proof.
