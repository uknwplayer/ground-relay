# Ground Relay

Ground Relay is a mobile-first human escalation network for autonomous agents, built for **CLOCK IN — A Solana Mobile Hackathon**.

Autonomous agents can stall when a workflow needs a human-only, device-local, or real-world action. Ground Relay turns that blocker into a structured microtask, lets an Android/Seeker user claim it, capture evidence, and receive a Solana payout after verification. A non-custodial Agent Gateway can then verify the settled on-chain state and resume the originating agent through an idempotent callback.

## Core loop

`agent blocked -> funded task -> worker claims -> evidence submitted -> verified -> paid -> agent resumes`

Ground Relay has separately proven the physical mobile settlement path, the restart-safe agent-resume path, and the first M8 hardening slice for a real Gateway-backed mobile inbox with restart restoration.

## Documentation guide

### Start here

| Document | Best for | What it explains |
| --- | --- | --- |
| **[Product Anatomy & Operating Model](docs/product-anatomy.md)** | Evaluators, judges, new contributors | End-to-end purpose, actors, architecture, money/evidence flow, trust boundaries, and real-world use cases. |
| **[Execution Roadmap](docs/roadmap.md)** | Evaluators and contributors | Milestones from prototype through settlement, agent resume, hardening, release, and submission. |
| **[Current Checkpoint](docs/checkpoints/CURRENT.md)** | Anyone continuing the work | Canonical handoff: verified proofs, current stage, immutable IDs/signatures, constraints, and next action. |

### Product and architecture

| Document | Purpose |
| --- | --- |
| **[Architecture](docs/architecture.md)** | Technical overview of mobile app, Agent Gateway, Solana layer, state flow, and security model. |
| **[Escrow Protocol](docs/escrow-protocol.md)** | Task/vault PDAs, Anchor state machine, settlement rules, and escrow security properties. |
| **[Agent Gateway OpenAPI](docs/openapi.yaml)** | Machine-readable API contract, including the worker-safe task inbox endpoint. |
| **[M7 Gateway Design](docs/superpowers/specs/2026-09-25-agent-gateway-resume-design.md)** | Detailed Gateway persistence, trust-boundary, callback, retry, and restart semantics. |
| **[M8 Inbox + Restart Design](docs/superpowers/specs/2026-09-26-m8-mobile-inbox-restart-design.md)** | Gateway discovery vs. Solana authority, mobile cache/restart behavior, fail-closed action rules. |
| **[M8 Implementation Plan](docs/superpowers/plans/2026-09-26-m8-mobile-inbox-restart.md)** | Task-by-task TDD plan for the first M8 product-hardening slice. |
| **[Demo Script](docs/demo-script.md)** | Concise presentation flow for the human-in-the-loop product. |

### Audit trail

| Document | Purpose |
| --- | --- |
| **[First Physical Anchor Payout Proof](docs/checkpoints/archive/2026-09-26-mobile-anchor-paid.md)** | Exact addresses, evidence hash, acceptance, payout, and independent post-settlement verification. |
| **[M6 Devnet Guard Proof](docs/checkpoints/archive/2026-09-26-m6-devnet-guards.md)** | Double-pay, authorization, expiry, cancellation, and refund failure-path proof. |
| **[M7 Agent Resume Proof](docs/checkpoints/archive/2026-09-26-m7-agent-resume.md)** | Durable Gateway, authoritative chain sync, idempotent callback, retry/restart, and seeded agent-resume proof. |
| **[M8 Inbox + Restart Proof](docs/checkpoints/archive/2026-09-26-m8-inbox-restart.md)** | Worker-safe task inbox, selected-PDA authority, restart restoration, CI and Android build evidence. |

Suggested evaluator reading order:

`Product Anatomy -> Roadmap -> Architecture -> Escrow Protocol -> Physical Payout Proof -> M7 Agent Resume Proof -> M8 Inbox/Restart Proof -> Current Checkpoint`

## Proven physical Solana settlement

Ground Relay completed the real mobile escrow lifecycle on a physical Android device against the deployed Anchor program on Solana devnet:

`OPEN -> CLAIMED -> DELIVERED -> ACCEPTED -> PAID`

The physical app proved Solflare connection through Mobile Wallet Adapter, funded task reads from devnet, real Anchor `claim_task`, camera evidence capture and local SHA-256, real Anchor `submit_evidence`, poster-side acceptance, worker-side payout, and final token transfer.

Controlled program ID:

`6v2peeoZVj2AXfczVLqyMUTHYt3XQPqAxCktpTwjUZap`

Canonical physical proof:

- task PDA: `7knPNeaZHDn7qVzdGy6Qbq3tWnHMnP2TpHULwLKzVtpT`
- vault PDA: `FGaGmGu8cbYRbdsUubmLDDRNnjic5NutnCM4kFL77bZm`
- reward: `0.001 WSOL`
- evidence SHA-256: `7d29069a59aec691ef133d7b7813cdd6e0d4a2ffc807e0887f9a5ad5a59ba802`
- acceptance signature: `4QVs7r2xBgSNzZHm8z3N5jbJZKVNCAT4cXEw9pTCqVRv79DchyYDfjnUXUsDJCVWuWFZCZ6WJYE1zTBrDoHSF8Hd`
- payout signature: [`4miSuLtKtHANH7Auv52FbQECCyiPc9gQioo5qENWS8izvyeQtHwPgMZad7W9GyGKJ9MzyYyUD8P6pW9qvM92kpEk`](https://solscan.io/tx/4miSuLtKtHANH7Auv52FbQECCyiPc9gQioo5qENWS8izvyeQtHwPgMZad7W9GyGKJ9MzyYyUD8P6pW9qvM92kpEk?cluster=devnet)

Independent inspection run `36207197941` confirmed `PAID`, vault `0`, and worker token amount `1,000,000` atomic WSOL.

## Proven settlement guards

M6 workflow `36208008464` proved on devnet that Ground Relay rejects wrong-worker/wrong-poster actions, premature release, second payout, claim-after-payment, expired claim, second cancellation, and claim-after-cancel. It also proved exact cancellation/refund behavior.

## Proven Agent Gateway + resume loop

M7 provides a restart-safe, **non-custodial** Agent Gateway with versioned atomic persistence, durable external-task ↔ task-PDA binding, authoritative Solana synchronization, create idempotency, deterministic resume event identity, verified PAID settlement notification, real HTTP callback delivery, persisted retry/backoff, restart recovery, and manual retry.

Post-merge Gateway check run `36249541738` passed.

Resume semantics are intentionally:

**one logical resume event, at-least-once HTTP transport until acknowledgement**.

Ground Relay does not claim exactly-once HTTP transport.

## M8 mobile inbox + restart hardening

The first M8 slice removes the single historical fixture as the mobile startup owner.

The mobile app now:

- fetches a worker-safe task list from `GET /v1/tasks`;
- restores a versioned cached inbox and selected task through AsyncStorage;
- treats cached/Gateway state as display/discovery state only;
- reads the **exact selected task PDA** from Solana before actions are enabled;
- validates poster/mint/reward/task identity during reconciliation;
- keeps claim/capture/evidence actions locked until authoritative reconciliation succeeds;
- keeps unbound, offline, mismatched, or malformed tasks read-only;
- restores session receipts without auto-replaying any transaction after restart;
- no longer silently falls back to the canonical M5 PDA for generic task execution.

Generic arbitrary-task payout remains deliberately fail-closed until task-specific vault and worker-token account derivation is independently verified.

Verification:

- mobile CI `36265032725`: **83/83 tests PASS** + TypeScript typecheck PASS;
- Android standalone APK `36265450015`: Expo prebuild PASS, `assembleRelease` PASS, artifact-upload step PASS;
- detailed record: [`docs/checkpoints/archive/2026-09-26-m8-inbox-restart.md`](docs/checkpoints/archive/2026-09-26-m8-inbox-restart.md).

This Android run proves the branch still produces a standalone release APK. It is not yet the M9 fresh-device installation proof.

## Mobile transaction reconciliation

Physical testing exposed a Mobile Wallet Adapter edge case where Solflare can successfully submit a transaction while Android returns `CancellationException` as control returns to the app.

Ground Relay reconciles ambiguous wallet returns against authoritative on-chain task state before showing failure.

## Run the mobile app locally

Ground Relay uses Solana Mobile native modules, so **Expo Go is not sufficient**. Use an Android emulator/device and a native build.

```bash
npm install
npm test
npm run typecheck
npm run android
```

Configure the Gateway base URL for the real inbox:

```bash
EXPO_PUBLIC_GROUND_RELAY_GATEWAY_URL=http://<gateway-host>:8787/v1
```

Use an MWA-compatible wallet for wallet flows.

## Run the Agent Gateway proof

```bash
cd gateway
npm ci
npm test
npm run demo
```

The seeded Gateway demo is deterministic and does not require a live wallet or devnet RPC. The real runtime defaults to Solana devnet and program `6v2peeoZVj2AXfczVLqyMUTHYt3XQPqAxCktpTwjUZap`.

Environment overrides include `GROUND_RELAY_STATE_PATH`, `GROUND_RELAY_RPC_URL`, `GROUND_RELAY_PROGRAM_ID`, and development-only `GROUND_RELAY_ALLOW_LOOPBACK_HTTP=1`.

## Security

- Development defaults to Solana devnet.
- Never commit private keys, seed phrases, wallet secrets, GitHub Secrets, or auth tokens.
- The Agent Gateway is non-custodial and does not sign settlement transactions.
- After binding, the Solana task account is authoritative.
- Evidence payloads stay off-chain; protocol state uses evidence hashes.
- Runtime Gateway state under `gateway/data/` is not committed.
- Callback URL validation is centralized; production SSRF/allowlist hardening remains M8 work.
- The worker does not post a deposit to participate.
- Completed paid fixtures are historical proof and must not be reset or represented as fresh tasks.
- Generic payout remains fail-closed for arbitrary tasks until account derivation is independently verified.

## Current stage

**M5 physical Anchor integration, M6 settlement/lifecycle guards, and M7 Agent Gateway/resume are complete.**

The first M8 slice — real Gateway-backed mobile inbox + restart-safe selected-task restoration — is implemented and automatically verified. M8 as a whole remains active: receipt/history UI, physical non-canonical inbox/restart validation, callback/SSRF hardening, evidence privacy, payment/account review, rent reclamation, generic payout derivation, and final repeatability work remain.

See [`docs/checkpoints/CURRENT.md`](docs/checkpoints/CURRENT.md) for the exact handoff.

## License

MIT
