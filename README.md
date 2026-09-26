# Ground Relay

Ground Relay is a mobile-first human escalation network for autonomous agents, built for **CLOCK IN — A Solana Mobile Hackathon**.

Autonomous agents can stall when a workflow needs a human-only, device-local, or real-world action. Ground Relay turns that blocker into a structured microtask, lets an Android/Seeker user claim it, capture evidence, and receive a Solana payout after verification. The originating agent can then resume automatically.

## Core loop

`agent blocked -> task posted -> worker claims -> evidence submitted -> verified -> paid -> agent resumes`

## Documentation guide

This repository keeps product explanation, technical design, execution planning, and continuity records separate so a reviewer can understand the project without reconstructing context from commit history or private conversations.

### Start here

| Document | Best for | What it explains |
| --- | --- | --- |
| **[Product Anatomy & Operating Model](docs/product-anatomy.md)** | Evaluators, judges, new contributors | The clearest end-to-end explanation of Ground Relay: purpose, actors, architecture, connections, money flow, evidence flow, trust boundaries, failure paths, real-world use cases, current proof points, and what is still under integration. |
| **[Execution Roadmap](docs/roadmap.md)** | Evaluators and contributors | Every milestone from the completed prototype work through real escrow settlement, agent resume, product hardening, release APK, demo video, pitch deck, and final submission. |
| **[Current Checkpoint](docs/checkpoints/CURRENT.md)** | Anyone continuing the work | Canonical handoff state: what is verified, exact public IDs/signatures that matter, current blocker, known limitations, what must not be repeated, and the single next recommended action. |

### Product and architecture

| Document | Purpose |
| --- | --- |
| **[Architecture](docs/architecture.md)** | Short technical overview of the mobile app, Agent Gateway, Solana layer, state flow, and security model. |
| **[Escrow Protocol](docs/escrow-protocol.md)** | Detailed on-chain design: task/vault PDAs, state machine, Anchor instructions, settlement rules, and escrow security properties. |
| **[Agent Gateway OpenAPI](docs/openapi.yaml)** | Machine-readable API contract for task creation, status, deliveries, verification, and agent-facing integration. |
| **[Demo Script](docs/demo-script.md)** | Concise demonstration flow for presenting the product and its human-in-the-loop loop. |

### Project continuity and audit trail

| Document | Purpose |
| --- | --- |
| **[Checkpoint Guide](docs/checkpoints/README.md)** | Defines how checkpoints are written, archived, and kept free of secrets. |
| **[Checkpoint Archive](docs/checkpoints/archive/)** | Historical milestone handoffs and proof records. |
| **[First Physical Anchor Payout Proof](docs/checkpoints/archive/2026-09-26-mobile-anchor-paid.md)** | Exact addresses, evidence hash, workflow runs, acceptance signature, payout signature, and independent post-settlement verification. |
| **[Current Checkpoint](docs/checkpoints/CURRENT.md)** | The only checkpoint that should be treated as the current source of truth. |

### Suggested reading order for an evaluator

`Product Anatomy -> Roadmap -> Architecture -> Escrow Protocol -> Physical Payout Proof -> Current Checkpoint`

## Current status

Ground Relay has now proven the real end-to-end mobile escrow path on a physical Android device against the deployed Anchor program on Solana devnet:

`OPEN -> CLAIMED -> DELIVERED -> ACCEPTED -> PAID`

The physical app successfully:

- connects to Solflare through Solana Mobile Wallet Adapter
- reads the real funded task account from devnet
- signs the real Anchor `claim_task` instruction
- captures camera evidence on-device
- computes the evidence SHA-256 locally
- signs the real Anchor `submit_evidence` instruction
- hydrates authoritative task state from chain
- receives poster-side `accept_task` verification
- signs worker-side `release_payment`
- displays the final `PAID` state

Controlled devnet program ID:

`6v2peeoZVj2AXfczVLqyMUTHYt3XQPqAxCktpTwjUZap`

Canonical proof task:

- task PDA: `7knPNeaZHDn7qVzdGy6Qbq3tWnHMnP2TpHULwLKzVtpT`
- vault PDA: `FGaGmGu8cbYRbdsUubmLDDRNnjic5NutnCM4kFL77bZm`
- payment asset: devnet WSOL
- funded reward: `0.001 WSOL`
- evidence SHA-256: `7d29069a59aec691ef133d7b7813cdd6e0d4a2ffc807e0887f9a5ad5a59ba802`
- acceptance signature: `4QVs7r2xBgSNzZHm8z3N5jbJZKVNCAT4cXEw9pTCqVRv79DchyYDfjnUXUsDJCVWuWFZCZ6WJYE1zTBrDoHSF8Hd`
- payout signature: [`4miSuLtKtHANH7Auv52FbQECCyiPc9gQioo5qENWS8izvyeQtHwPgMZad7W9GyGKJ9MzyYyUD8P6pW9qvM92kpEk`](https://solscan.io/tx/4miSuLtKtHANH7Auv52FbQECCyiPc9gQioo5qENWS8izvyeQtHwPgMZad7W9GyGKJ9MzyYyUD8P6pW9qvM92kpEk?cluster=devnet)

Independent post-payout inspection confirmed:

- task status: `paid`
- escrow vault amount: `0`
- worker token amount: `1,000,000` atomic WSOL
- worker token owner and mint: correct
- invariant checks: PASS

Inspection workflow run: [`36207197941`](https://github.com/uknwplayer/ground-relay/actions/runs/36207197941).

**M5 is complete.** The project is now in **M6 — acceptance/payout failure paths and escrow lifecycle hardening**.

## Mobile transaction reconciliation

Physical testing uncovered a real Mobile Wallet Adapter edge case: a wallet can successfully submit a Solana transaction while the Android session returns a `CancellationException` as control returns to the app.

Ground Relay now reconciles ambiguous wallet returns against authoritative on-chain task state before showing a failure. Regression tests cover claim, evidence delivery, payout, hash matching, and wrong-worker protection.

CI run [`36207598375`](https://github.com/uknwplayer/ground-relay/actions/runs/36207598375) passed all six Node tests plus TypeScript typechecking.

## Earlier memo prototype receipts

Before the direct Anchor path was available, the physical prototype used memo-backed receipts:

- claim: `23My4fQYQy3vp6YpkSPRfLFBMqkLuusmZJFN92pGB9mjjATAwKSamXjQVZxT8Giy3Ekii8QLeT8SofRzavKc3BTy`
- delivery: `5hycogT2MMUKfnXTuYgS1jgzvP6atyeBAEsEoEzpjGdFYUD4dXzB53EfUPHnqA6xwzVkLtw6krRwStDQyQKvEQGN`

These remain historical prototype evidence, but the direct Anchor escrow proof above supersedes them as the primary product proof.

## Run locally

Ground Relay uses Solana Mobile native modules, so **Expo Go is not sufficient**. Use an Android emulator/device and a native build.

```bash
npm install
npm test
npm run typecheck
npm run android
```

Install an MWA-compatible development wallet on the Android device/emulator before testing wallet flows.

## Security

- Development defaults to Solana devnet.
- Never commit private keys, seed phrases, wallet secrets, GitHub Secrets, or auth tokens.
- Evidence payloads stay off-chain. Only hashes, receipts, and state references should be committed on-chain.
- The worker does not need to post a deposit to participate.
- Deployment identities must remain stable unless there is a deliberate migration.
- A completed paid fixture must not be reset or represented as fresh proof; new failure-path fixtures should be isolated.

## License

MIT
