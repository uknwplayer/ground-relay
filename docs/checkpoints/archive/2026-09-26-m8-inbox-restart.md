# M8 mobile inbox + restart restoration proof

Date: 2026-09-26
Branch: `m8-product-hardening`
Scope: first M8 hardening slice only; no mainnet deployment or secret changes.

## Goal

Replace the mobile app's single historical fixture startup path with a Gateway-backed task inbox that restores safe context after restart and only enables Solana actions after reconciling the exact selected task PDA.

Architecture:

`Gateway discovery/index -> mobile inbox/cache -> selected task binding -> Solana authoritative read -> reconciled task detail/actions`

Gateway metadata is discovery data. Solana remains authoritative for worker/status/evidence/mint/reward and action eligibility.

## Implemented

- worker-safe `GET /v1/tasks` projection with deterministic ordering;
- typed mobile inbox client and strict response validation;
- versioned restart-safe mobile state at `ground-relay/mobile-state/v1`;
- defensive recovery from corrupt/unsupported persisted state;
- selected-task Solana readers/builders require explicit task addresses;
- canonical M5 task PDA is no longer an implicit execution fallback;
- generic payout requires an explicit `PayoutExecutionContext` and remains fail-closed in the app until account derivation is independently verified;
- selected-task reconciliation validates chain binding and task identity before actions unlock;
- claim/capture/evidence eligibility is derived from reconciled chain state and connected worker identity;
- app startup now restores cached inbox/selection, refreshes the Gateway, reads the selected PDA, and reconciles before enabling state-changing actions;
- restart planning contains reads/reconciliation only and never auto-replays a transaction;
- unbound, offline, chain-unavailable, malformed, or mismatched tasks remain read-only;
- CI, Gateway check, and Android APK workflows run on `m8-*` branches.

## TDD evidence

### Task 1 — Gateway inbox

- RED: `d14be965...`
- final Task 1 head: `13c8087dc586a07d0457090b13bfddfc3ae8b3d9`
- Gateway check: `36258958881` — PASS

### Task 2 — typed inbox client

- RED: `d98050d2d3e6223a65e65cc9deba13739f59a4ca`
- GREEN: `74f021db46aecd2e62c80e72c4bca9299b70f484`
- CI: `36260538148` — tests PASS, typecheck PASS

### Task 3 — restart-safe persistence

- RED: `22a0edd08a455e2e4515e4d56f963e4aab79f03a`
- GREEN: `63a9836c792ac646f594aeb50856c61c26bdf0e7`
- TypeScript compatibility fix: `420d7a9714ad3fa72cf1714d3468063ac22a8941`
- CI: `36263194819` — 68/68 PASS, typecheck PASS

### Task 4 — explicit selected-task addressing

- RED: `822499e6c5ba9d3ba0446dbd2743b395875e604a`
- GREEN: `5df255fa36a6c2216de2696aa953891098c8cb81`
- CI: `36263792983` — tests PASS, typecheck PASS

The anti-regression tests use distinct synthetic task PDAs and prove selected-task builders do not silently substitute the historical fixture PDA.

### Task 5 — authoritative reconciliation/action gating

- RED: `4083ea6276328e76b248edb02388877c5aa8ebd2`
- GREEN: `df839078db096b0fa0894b6a7d99208293342300`
- CI: `36264277071` — tests PASS, typecheck PASS

### Task 6 — app orchestration

- RED: `6dd3f40a423f0be03db54052cd46f047bf4d9dde`
- GREEN: `fdd11026dd2eb1a0be23c0053300db592cd0e8cb`
- CI: `36265032725` — **83/83 tests PASS**, TypeScript typecheck PASS

The flow tests prove selection restoration between multiple tasks and prove restart planning produces no transaction replay.

## Android build proof

M8 branch APK workflow enablement commit:

`c13e06cfe960ce8cfea311127d621cce7896330a`

Android standalone APK run:

`36265450015`

Result: **PASS**

Verified workflow steps include:

- dependency install: PASS;
- Expo Android project generation: PASS;
- standalone release APK build (`assembleRelease`): PASS;
- artifact upload step: PASS.

This is a build/repeatability proof, not a fresh-device installation proof. Fresh-device installation remains M9 work.

## Failure-closed behavior

- Gateway unavailable: cached inbox may be shown, but no cached state becomes transaction authority.
- Solana unavailable: selected task remains read-only.
- Missing binding: task may remain visible but cannot execute on-chain actions.
- Binding/task identity mismatch: reconciliation fails and actions remain disabled.
- Persisted state corruption: invalid state is filtered/discarded rather than trusted.
- Restart: no automatic transaction replay.
- Generic payout: disabled until explicit task-specific vault/token context is independently verified.

## Historical fixture boundary

The canonical paid M5 fixture remains historical proof only:

- task PDA `7knPNeaZHDn7qVzdGy6Qbq3tWnHMnP2TpHULwLKzVtpT`
- final state `PAID`

M8 does not reset, recreate, or represent that fixture as a fresh OPEN task.

## Known limits / follow-on M8 work

This checkpoint does **not** claim M8 as a whole is complete. Remaining work includes:

- dedicated receipt/history screen beyond restored task/session receipts;
- physical-device validation of the new multi-task inbox/restart path with a non-canonical devnet task;
- independently verified generic payout account derivation before re-enabling payout for arbitrary tasks;
- callback/SSRF deployment hardening;
- evidence privacy review;
- account/payment security review;
- terminal task/vault rent reclamation policy;
- deep-link/QR handoff if useful;
- complete demo-only-value sweep;
- tighten repeated same-`/paid` semantics so terminal callback failure and exhausted retries still require manual retry, while pending/in-flight delivery cannot be duplicated.

No mainnet action occurred. No wallet/deployment secret was changed or committed.
