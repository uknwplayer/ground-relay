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
| **[Checkpoint Archive](docs/checkpoints/archive/)** | Historical milestone handoffs used to preserve important previous states without cluttering the main README. |
| **[Current Checkpoint](docs/checkpoints/CURRENT.md)** | The only checkpoint that should be treated as the current source of truth. |

### Suggested reading order for an evaluator

`Product Anatomy -> Roadmap -> Architecture -> Escrow Protocol -> Current Checkpoint`

That sequence starts with the product thesis, then shows the path to completion, the system design, the settlement mechanics, and finally the exact live state of the project.

## Current status

Ground Relay has a working physical-Android prototype with:

- Solana Mobile Wallet Adapter connection through Solflare
- devnet claim receipt
- camera evidence capture
- SHA-256 evidence hashing
- devnet delivery receipt
- visible claim/delivery signatures and task progression

The custom Anchor escrow program is deployed and independently verified executable on Solana devnet.

Controlled devnet program ID:

`6v2peeoZVj2AXfczVLqyMUTHYt3XQPqAxCktpTwjUZap`

A real funded escrow fixture now exists on-chain:

- task PDA: `7knPNeaZHDn7qVzdGy6Qbq3tWnHMnP2TpHULwLKzVtpT`
- vault PDA: `FGaGmGu8cbYRbdsUubmLDDRNnjic5NutnCM4kFL77bZm`
- payment asset: devnet WSOL
- funded reward: `0.001 WSOL`
- `post_task` signature: `4tBjUWu9cnSZQSHqGkwNZHyJN92uRy1eDAhjQhoUhzZDGuCaKWKPpmhgmA8YHcPBQtYRU5JEseEDywJZ6ZF6pCRi`

The current milestone is **M5 — physical validation of direct mobile Anchor integration**. The Android source now builds real `claim_task`, `submit_evidence`, and worker-signed `release_payment` instructions and hydrates task state directly from devnet. Physical-device validation of that new path is still required before it is marked proven.

## Devnet prototype receipts

- claim: `23My4fQYQy3vp6YpkSPRfLFBMqkLuusmZJFN92pGB9mjjATAwKSamXjQVZxT8Giy3Ekii8QLeT8SofRzavKc3BTy`
- delivery: `5hycogT2MMUKfnXTuYgS1jgzvP6atyeBAEsEoEzpjGdFYUD4dXzB53EfUPHnqA6xwzVkLtw6krRwStDQyQKvEQGN`

These prove the prototype receipt flow. They are not evidence of a custom-program escrow payout.

## Run locally

Ground Relay uses Solana Mobile native modules, so **Expo Go is not sufficient**. Use an Android emulator/device and a native build.

```bash
npm install
npm run android
```

Install an MWA-compatible development wallet on the Android device/emulator before testing wallet flows.

## Security

- Development defaults to Solana devnet.
- Never commit private keys, seed phrases, wallet secrets, GitHub Secrets, or auth tokens.
- Evidence payloads stay off-chain. Only hashes, receipts, and state references should be committed on-chain.
- The worker does not need to post a deposit to participate.
- Deployment identities must remain stable unless there is a deliberate migration.

## License

MIT
