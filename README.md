# Ground Relay

Ground Relay is a mobile-first human escalation network for autonomous agents, built for **CLOCK IN — A Solana Mobile Hackathon**.

Autonomous agents can stall when a workflow needs a human-only, device-local, or real-world action. Ground Relay turns that blocker into a funded microtask, lets an Android worker claim it and capture evidence, settles the reward through a non-custodial Solana escrow, and lets an Agent Gateway resume the originating workflow only after authoritative settlement.

## Core loop

`agent blocked -> funded task -> worker claims -> evidence -> verifier accepts -> escrow pays worker -> agent resumes`

The project has physically exercised the hardened M8 mobile path on a fresh, non-canonical devnet task, including restart recovery, camera evidence, generic payout derivation, a real network/DNS failure after wallet submission, and final `PAID` reconciliation without replaying the transaction.

## Documentation guide

| Document | Best for | What it explains |
| --- | --- | --- |
| **[Product Anatomy & Operating Model](docs/product-anatomy.md)** | Evaluators, judges, new contributors | End-to-end purpose, actors, architecture, money/evidence flow, trust boundaries, and real-world use cases. |
| **[Execution Roadmap](docs/roadmap.md)** | Evaluators and contributors | Milestones from prototype through settlement, agent resume, hardening, release, and submission. |
| **[Current Checkpoint](docs/checkpoints/CURRENT.md)** | Anyone continuing the work | Canonical handoff, verified proofs, current stage, immutable IDs/signatures, constraints, and next action. |
| **[Architecture](docs/architecture.md)** | Technical reviewers | Mobile app, Agent Gateway, Solana layer, state flow, and trust boundaries. |
| **[Escrow Protocol](docs/escrow-protocol.md)** | Protocol reviewers | Task/vault PDAs, Anchor state machine, settlement rules, and escrow security properties. |
| **[Agent Gateway OpenAPI](docs/openapi.yaml)** | Integrators | Machine-readable API contract. |
| **[Evidence Privacy](docs/security/evidence-privacy.md)** | Security/privacy review | Local photo retention and on-chain evidence-hash policy. |
| **[Demo Script](docs/demo-script.md)** | Presentation | 90-second product narrative. |
| **[M8 Completion Record](docs/checkpoints/archive/2026-09-27-m8-complete.md)** | Reviewers | Full hardened physical proof, recovery regression, cleanup, and consolidated closeout evidence. |

## Proven Solana settlement

Ground Relay has completed the full physical lifecycle on Android against the controlled devnet program:

`OPEN -> CLAIMED -> DELIVERED -> ACCEPTED -> PAID`

Program ID:

`6v2peeoZVj2AXfczVLqyMUTHYt3XQPqAxCktpTwjUZap`

The first historical physical proof remains preserved as audit evidence and is never reused as a fresh task. The hardened M8 proof used a separate task:

- task PDA: `BT5sKaBENnaJx1FPmYTtLC7XEojDnVvXpR455cu1Np5y`
- vault PDA: `F8vdvACWiaFCmh95HLEJGKVbZsXZ9Wvs5cd33qzbZysV`
- worker: `7XY6t1adc9vmuefiEP25TsoEjxRkFhVxT4yQrtN5zr2C`
- reward: `1,000,000` atomic = `0.001 WSOL`
- evidence SHA-256: `87c1f0a74d733d3f7e197dc8eb2319bbcd1e55eadef00a4db7c84e64124aeed1`
- acceptance signature: `2e9xNS5DxU1a6i6cXYpWMHvWqsyGHkvLZtpUM74wmQQJh581BzJSd6fLcgm2yL7accFb3uap8mjbCSE8AfPpRC1C`
- payout signature: `UbpwAKQMUHmFyBGBF9Z7tq76LmS5oHtT8cyA27SG2ZRoWn7Hn4y57HDR9vPhGWNfw3o5deNEHwCeDYVxQYr2Qge`
- payout slot: `504746194`
- worker WSOL ATA delta: `+1,000,000` atomic
- vault delta: `-1,000,000` atomic, final amount `0`

Independent payout verification run `36311952353` confirmed the exact token-balance deltas and authoritative `PAID` state.

Detailed records:

- [`docs/checkpoints/archive/2026-09-26-mobile-anchor-paid.md`](docs/checkpoints/archive/2026-09-26-mobile-anchor-paid.md) — first physical Anchor payout.
- [`docs/checkpoints/archive/2026-09-27-m8-physical-paid.md`](docs/checkpoints/archive/2026-09-27-m8-physical-paid.md) — fresh hardened M8 task and exact payout proof.
- [`docs/checkpoints/archive/2026-09-27-m8-complete.md`](docs/checkpoints/archive/2026-09-27-m8-complete.md) — complete M8 closeout record.

## Mobile hardening

The Android app now:

- discovers tasks through the worker-safe Gateway inbox;
- selects and reconciles the exact task PDA against Solana before state-changing actions are enabled;
- persists versioned safe restart context without automatically replaying transactions;
- keeps raw evidence photos local and persists only safe metadata/receipts;
- derives the canonical task vault and worker classic-SPL ATA for the selected task;
- verifies token-program ownership, mint, vault authority, worker authority, and reward funding before enabling payout;
- reconciles ambiguous Mobile Wallet Adapter returns against authoritative Solana state;
- fails closed when Gateway or Solana state cannot be verified.

Physical M8 testing exposed a real device DNS failure immediately after a successful payout transaction. The transaction had already reached Solana, while the post-wallet RPC read failed. The app correctly prevented replay; a follow-up regression test also removed the misleading fallback that could display stale Gateway `OPEN` state while authoritative RPC was unavailable.

Regression evidence:

- RED run `36312405844` reproduced the stale-authority presentation;
- GREEN run `36312595528` passed mobile tests and TypeScript typecheck after the minimal fix.

## Agent Gateway

The Gateway is non-custodial: it stores task/callback state but does not hold worker or poster signing keys.

It provides:

- durable task persistence and task ↔ PDA binding;
- worker-safe inbox projection;
- authoritative Solana synchronization;
- create idempotency;
- stable paid-resume event identity;
- persisted callback retry/backoff and restart recovery;
- at-least-once HTTP delivery until acknowledgement;
- callback URL validation with DNS resolution, public-address enforcement, connection pinning, TLS hostname preservation, bounded redirects, and redirect revalidation.

The project deliberately does **not** claim exactly-once HTTP transport.

Hosted M8 Gateway smoke run `36303711875` passed against the public Render deployment. The persisted proof seed is terminalized as `PAID`, so a cold start cannot re-advertise the completed physical task as fresh `OPEN` work.

## Anchor hardening

The deployed devnet program includes:

- exact credited-token checks on funding, payout, and refund;
- canonical task-PDA constraints on transitions;
- classic SPL Token + no-freeze-authority policy for new escrows;
- delivery deadline enforcement;
- poster recovery of abandoned claimed tasks only after expiry;
- zero-balance terminal vault closure with rent returned only to the original poster;
- retained task PDA as the durable authoritative receipt.

The hardened SBF was upgraded under the original controlled program identity and independently inspected. The program ID and ProgramData identity were not replaced, and no mainnet deployment is authorized by these devnet proofs.

## Verification highlights

- M6 lifecycle/guard run: `36208008464` — PASS.
- M7 post-merge Gateway run: `36249541738` — PASS.
- Anchor SBF + IDL run: `36288500115` — PASS.
- IDL client consistency: `36289499220` — PASS.
- Hardened devnet deploy: `36294101421` attempt 2 — PASS.
- Independent post-deploy preflight: `36296153445` attempt 2 — PASS.
- Hosted Gateway smoke: `36303711875` — PASS.
- Fresh M8 task creation/binding: `36303227689` — PASS.
- M8 Android hosted-Gateway APK: `36303092998` — PASS.
- Poster acceptance: `36311385406` — PASS.
- Post-device-failure authoritative paid check: `36311843338` — PASS.
- Exact M8 payout audit: `36311952353` — PASS.
- Mobile DNS-recovery display regression: RED `36312405844`, GREEN `36312595528`.
- M8 consolidated final quality sweep: `36313234829` — PASS (`106/106` mobile tests, `63/63` Gateway tests, typecheck, deterministic Gateway demo, Anchor workspace tests, and repository hygiene).

## Run locally

Ground Relay uses Solana Mobile native modules, so **Expo Go is not sufficient**. Use an Android emulator/device and a native build.

```bash
npm install
npm test
npm run typecheck
npm run android
```

Configure the Gateway worker API:

```bash
EXPO_PUBLIC_GROUND_RELAY_GATEWAY_URL=http://<gateway-host>:8787/v1
```

Use an MWA-compatible wallet for wallet flows.

Run the Gateway verification locally:

```bash
cd gateway
npm ci
npm test
npm run demo
```

## Security boundaries

- Development and current proofs target Solana devnet.
- Never commit private keys, seed phrases, wallet secrets, deployment keypairs, or auth tokens.
- The Gateway is non-custodial and does not sign settlement transactions.
- Solana is authoritative after a task is bound.
- Gateway/cache state is discovery and recovery context, never transaction authorization.
- Evidence photo bytes remain off-chain; protocol state stores an evidence hash.
- State-changing mobile actions remain locked when the exact selected PDA cannot be reconciled.
- Completed paid fixtures are historical proof and must never be reset or presented as fresh tasks.
- No mainnet deployment is authorized from this repository checkpoint.

## Current stage

**M8 is complete on `m8-product-hardening`.** The next stage is M9 release/submission preparation. The immediate human-controlled decision is how to integrate the completed M8 branch into `main`; after that, produce and fresh-device-test the final post-M8 release APK and finish reviewer proof links, video, deck, screenshots, and submission copy.

See [`docs/checkpoints/CURRENT.md`](docs/checkpoints/CURRENT.md) for the exact handoff.

## License

MIT
