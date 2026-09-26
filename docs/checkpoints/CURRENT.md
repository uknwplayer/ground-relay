# Current checkpoint

**Local date:** 2026-09-26  
**UTC date:** 2026-09-26  
**Stage:** M8 — product hardening  
**Repository:** `uknwplayer/ground-relay`  
**Working branch:** `m8-product-hardening`

## Current state

Ground Relay has proven the core product loop in two connected halves:

1. a physical Android worker completed and settled a funded Anchor task on Solana devnet;
2. the non-custodial Agent Gateway durably correlated a task to an originating agent and delivered an idempotent resume callback only after authoritative PAID settlement.

Target loop:

`agent blocked -> funded task -> worker claims -> camera evidence -> verifier accepts -> escrow pays worker -> verified agent resume callback`

M5, M6, and M7 are complete. M7 is merged into `main`. M8 is active; its first mobile inbox/restart slice is implemented and automatically verified, but M8 as a whole is not complete.

## Canonical devnet identity

Program ID:

`6v2peeoZVj2AXfczVLqyMUTHYt3XQPqAxCktpTwjUZap`

Controlled upgrade/deployer/poster:

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
- reward: `1,000,000` atomic = `0.001 WSOL`
- evidence SHA-256: `7d29069a59aec691ef133d7b7813cdd6e0d4a2ffc807e0887f9a5ad5a59ba802`
- acceptance signature: `4QVs7r2xBgSNzZHm8z3N5jbJZKVNCAT4cXEw9pTCqVRv79DchyYDfjnUXUsDJCVWuWFZCZ6WJYE1zTBrDoHSF8Hd`
- payout signature: `4miSuLtKtHANH7Auv52FbQECCyiPc9gQioo5qENWS8izvyeQtHwPgMZad7W9GyGKJ9MzyYyUD8P6pW9qvM92kpEk`
- independent post-payout inspection run: `36207197941`
- final state: `PAID`
- final vault amount: `0`
- final worker token amount: `1,000,000`

Detailed record: `docs/checkpoints/archive/2026-09-26-mobile-anchor-paid.md`.

The canonical fixture is historical proof. Do not reset or present it as a fresh OPEN task.

## M6 settlement/lifecycle proof

Run `36208008464` proved wrong-worker/wrong-poster rejection, release-before-acceptance rejection, second-payout rejection with unchanged balances, expired-claim rejection, exact open-task cancellation/refund, second-cancel rejection, and claim-after-cancel rejection.

Detailed record: `docs/checkpoints/archive/2026-09-26-m6-devnet-guards.md`.

## M7 Agent Gateway proof

M7 provides durable JSON persistence, external task <-> PDA binding, authoritative Solana sync, create idempotency, stable resume event identity, verified PAID settlement notification, HTTP resume delivery, persisted retry/backoff, restart recovery, manual retry, and a deterministic seeded agent-resume demo.

Merged M7 main commit:

`42231293ed787d367d0db9d4e183daed6e9f979c`

Post-merge Gateway check:

`36249541738` — PASS

Resume semantics remain:

**one logical event, at-least-once HTTP transport until acknowledgement**.

Detailed record: `docs/checkpoints/archive/2026-09-26-m7-agent-resume.md`.

## M8 first slice — inbox + restart restoration

The first M8 slice is implemented on `m8-product-hardening`.

Implemented:

- Gateway worker-safe `GET /v1/tasks` projection;
- typed mobile inbox client;
- versioned `ground-relay/mobile-state/v1` persistence;
- safe restart restoration of inbox/selection/session receipts;
- selected-task Solana reads and transaction builders with explicit task PDA;
- no implicit fallback to the canonical M5 task PDA for generic execution;
- authoritative selected-task reconciliation and fail-closed action gating;
- Gateway/Solana outage handling that remains read-only when authority is unavailable;
- restart plan that performs reads/reconciliation only and never auto-replays transactions;
- app no longer starts from `demoTask`;
- generic payout remains fail-closed until task-specific vault/token account derivation is independently verified.

Verification:

- mobile CI `36265032725`: **83/83 tests PASS**, TypeScript typecheck PASS;
- Android standalone APK run `36265450015`: release APK build PASS and artifact-upload step PASS;
- detailed proof: `docs/checkpoints/archive/2026-09-26-m8-inbox-restart.md`.

This Android result proves build repeatability, not fresh-device installation of the new M8 flow.

## Remaining M8 work

Priority follow-ons:

1. dedicated receipt/history screen;
2. physical-device validation of the new multi-task inbox/restart flow using a non-canonical devnet task;
3. independently verify generic payout account derivation before enabling arbitrary-task payout;
4. tighten repeated same-`/paid` callback semantics: terminal callback failure and exhausted retries must still require manual retry, and pending/in-flight delivery must not duplicate;
5. callback/SSRF deployment hardening;
6. evidence privacy review;
7. account/payment security review;
8. terminal task/vault rent reclamation policy;
9. deep-link/QR handoff if useful;
10. repository-wide demo-only-value/legacy-behavior sweep.

M8 exit condition remains **not yet complete**.

## Key documents

- `docs/product-anatomy.md`
- `docs/roadmap.md`
- `docs/architecture.md`
- `docs/escrow-protocol.md`
- `docs/openapi.yaml`
- `docs/superpowers/specs/2026-09-26-m8-mobile-inbox-restart-design.md`
- `docs/superpowers/plans/2026-09-26-m8-mobile-inbox-restart.md`
- `docs/checkpoints/archive/2026-09-26-mobile-anchor-paid.md`
- `docs/checkpoints/archive/2026-09-26-m6-devnet-guards.md`
- `docs/checkpoints/archive/2026-09-26-m7-agent-resume.md`
- `docs/checkpoints/archive/2026-09-26-m8-inbox-restart.md`

## Do not repeat

- Do **not** run devnet identity bootstrap again.
- Do **not** regenerate the program keypair.
- Do **not** overwrite deployment GitHub Secrets.
- Do **not** reset/recreate the canonical paid fixture.
- Do **not** use old memo receipts as the primary Anchor proof.
- Do **not** commit keys, seed phrases, wallet secrets, or auth tokens.
- Do **not** make the Agent Gateway a custodial signer.
- Do **not** describe HTTP callback delivery as exactly-once transport.
- Do **not** authorize mainnet deployment from this checkpoint.

## Next recommended action

Continue M8 correctness hardening with the repeated same-`/paid` callback-state semantics, then implement the dedicated receipt/history view and exercise the generic selected-task path on a real non-canonical devnet task before calling M8 complete.
