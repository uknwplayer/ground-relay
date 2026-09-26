# Ground Relay

Ground Relay is a mobile-first human escalation network for autonomous agents, built for **CLOCK IN — A Solana Mobile Hackathon**.

Autonomous agents can stall when a workflow needs a human-only, device-local, or real-world action. Ground Relay turns that blocker into a structured microtask, lets an Android/Seeker user claim it, capture evidence, and receive a Solana payout after verification. A non-custodial Agent Gateway can then verify the settled on-chain state and resume the originating agent through an idempotent callback.

## Core loop

`agent blocked -> funded task -> worker claims -> evidence submitted -> verified -> paid -> agent resumes`

Ground Relay has now separately proven the real physical mobile settlement path and the restart-safe agent-resume path.

## Documentation guide

This repository keeps product explanation, technical design, execution planning, and continuity records separate so a reviewer can understand the project without reconstructing context from commit history or private conversations.

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
| **[Agent Gateway OpenAPI](docs/openapi.yaml)** | Machine-readable M7 API contract for durable tasks, chain binding/sync, verified settlement, and resume retry. |
| **[M7 Gateway Design](docs/superpowers/specs/2026-09-25-agent-gateway-resume-design.md)** | Detailed design decisions for persistence, trust boundaries, callbacks, retry, and restart behavior. |
| **[Demo Script](docs/demo-script.md)** | Concise presentation flow for the human-in-the-loop product. |

### Audit trail

| Document | Purpose |
| --- | --- |
| **[First Physical Anchor Payout Proof](docs/checkpoints/archive/2026-09-26-mobile-anchor-paid.md)** | Exact addresses, evidence hash, acceptance, payout, and independent post-settlement verification. |
| **[M6 Devnet Guard Proof](docs/checkpoints/archive/2026-09-26-m6-devnet-guards.md)** | Double-pay, authorization, expiry, cancellation, and refund failure-path proof. |
| **[M7 Agent Resume Proof](docs/checkpoints/archive/2026-09-26-m7-agent-resume.md)** | Durable Gateway, authoritative chain sync, idempotent callback, retry/restart, and seeded agent-resume proof. |

Suggested evaluator reading order:

`Product Anatomy -> Roadmap -> Architecture -> Escrow Protocol -> Physical Payout Proof -> M7 Agent Resume Proof -> Current Checkpoint`

## Proven physical Solana settlement

Ground Relay completed the real mobile escrow lifecycle on a physical Android device against the deployed Anchor program on Solana devnet:

`OPEN -> CLAIMED -> DELIVERED -> ACCEPTED -> PAID`

The physical app proved:

- Solflare connection through Solana Mobile Wallet Adapter;
- real funded task reads from devnet;
- real Anchor `claim_task`;
- camera evidence capture and local SHA-256;
- real Anchor `submit_evidence`;
- poster-side `accept_task`;
- worker-side `release_payment`;
- final `PAID` state and token transfer.

Controlled program ID:

`6v2peeoZVj2AXfczVLqyMUTHYt3XQPqAxCktpTwjUZap`

Canonical physical proof:

- task PDA: `7knPNeaZHDn7qVzdGy6Qbq3tWnHMnP2TpHULwLKzVtpT`
- vault PDA: `FGaGmGu8cbYRbdsUubmLDDRNnjic5NutnCM4kFL77bZm`
- reward: `0.001 WSOL`
- evidence SHA-256: `7d29069a59aec691ef133d7b7813cdd6e0d4a2ffc807e0887f9a5ad5a59ba802`
- acceptance signature: `4QVs7r2xBgSNzZHm8z3N5jbJZKVNCAT4cXEw9pTCqVRv79DchyYDfjnUXUsDJCVWuWFZCZ6WJYE1zTBrDoHSF8Hd`
- payout signature: [`4miSuLtKtHANH7Auv52FbQECCyiPc9gQioo5qENWS8izvyeQtHwPgMZad7W9GyGKJ9MzyYyUD8P6pW9qvM92kpEk`](https://solscan.io/tx/4miSuLtKtHANH7Auv52FbQECCyiPc9gQioo5qENWS8izvyeQtHwPgMZad7W9GyGKJ9MzyYyUD8P6pW9qvM92kpEk?cluster=devnet)

Independent inspection run `36207197941` confirmed status `paid`, vault `0`, and worker token amount `1,000,000` atomic WSOL.

## Proven settlement guards

M6 workflow `36208008464` proved on devnet that Ground Relay rejects wrong-worker/wrong-poster actions, premature release, second payout, claim-after-payment, expired claim, second cancellation, and claim-after-cancel. It also proved exact cancellation/refund behavior.

This protects the successful payout proof from being the only demonstrated path.

## Proven Agent Gateway + resume loop

M7 replaces the earlier in-memory Gateway prototype with a restart-safe, **non-custodial** reference service.

It now provides:

- versioned atomic JSON persistence;
- durable external task ID ↔ task PDA/post-signature binding;
- Ground Relay Anchor account decoding and identity validation;
- authoritative Solana state synchronization after binding;
- idempotent task creation;
- deterministic resume event IDs and `Idempotency-Key` values;
- settlement reconciliation that requires on-chain `PAID` rather than trusting the client;
- real HTTP resume callbacks;
- retry classification with persisted +1s/+2s/+4s/+8s/+16s backoff;
- retry recovery after Gateway restart;
- manual retry without changing event identity;
- no resend after a callback has returned `2xx`.

Deterministic proof workflow:

[`Gateway check` run 36211748985](https://github.com/uknwplayer/ground-relay/actions/runs/36211748985)

Result:

- `npm ci`: PASS
- tests: **48/48 PASS**
- `npm run demo`: **PASS**
- callback count before restart: `1`
- callback count after restart: `1`

The demo's stable event ID is:

`4deaf25af94d670a6d27317c6e128e5f8eff0779aabbe41fa22df19a1e3595a5`

Resume semantics are intentionally:

**one logical resume event, at-least-once HTTP transport until acknowledgement**.

Ground Relay does not claim exactly-once HTTP transport.

## Mobile transaction reconciliation

Physical testing uncovered a real Mobile Wallet Adapter edge case: Solflare can successfully submit a transaction while the Android session returns `CancellationException` as control returns to the app.

Ground Relay reconciles ambiguous wallet returns against authoritative on-chain task state before showing a failure. CI run `36207598375` passed the regression suite and TypeScript typecheck.

## Run the mobile app locally

Ground Relay uses Solana Mobile native modules, so **Expo Go is not sufficient**. Use an Android emulator/device and a native build.

```bash
npm install
npm test
npm run typecheck
npm run android
```

Install an MWA-compatible development wallet on the Android device/emulator before testing wallet flows.

## Run the Agent Gateway proof

```bash
cd gateway
npm ci
npm test
npm run demo
```

The seeded Gateway demo is deterministic and does not require a live wallet or devnet RPC. It uses a fake chain adapter, temporary JSON persistence, and a local mock agent callback receiver.

For the real runtime, the Gateway defaults to:

- state: `gateway/data/state.json`
- Solana RPC: `https://api.devnet.solana.com`
- program: `6v2peeoZVj2AXfczVLqyMUTHYt3XQPqAxCktpTwjUZap`

Environment overrides include `GROUND_RELAY_STATE_PATH`, `GROUND_RELAY_RPC_URL`, `GROUND_RELAY_PROGRAM_ID`, and development-only `GROUND_RELAY_ALLOW_LOOPBACK_HTTP=1`.

## Security

- Development defaults to Solana devnet.
- Never commit private keys, seed phrases, wallet secrets, GitHub Secrets, or auth tokens.
- The Agent Gateway is non-custodial and does not sign settlement transactions.
- After binding, the Solana task account is authoritative; a client cannot mark an unpaid bound task paid.
- Evidence payloads stay off-chain; protocol state uses evidence hashes.
- Runtime Gateway state under `gateway/data/` is not committed.
- Callback URL validation is centralized; production-grade SSRF/allowlist policy remains an M8 hardening item.
- The worker does not post a deposit to participate.
- Deployment identities remain stable unless there is a deliberate migration.
- Completed paid fixtures are historical proof and must not be reset or represented as fresh tasks.

## Current stage

**M5 physical Anchor integration, M6 settlement/lifecycle guards, and M7 Agent Gateway/resume are complete.**

The next milestone is **M8 — product hardening**: real task inbox/history, app state restoration, privacy/security review, callback deployment policy, terminal account/rent policy, and final repeatability work.

## License

MIT
