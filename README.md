# Ground Relay

Ground Relay is a mobile-first human escalation network for autonomous agents, built for **CLOCK IN — A Solana Mobile Hackathon**.

Autonomous agents can stall when a workflow needs a human-only, device-local, or real-world action. Ground Relay turns that blocker into a structured microtask, lets an Android/Seeker user claim it, capture evidence, and receive a Solana payout after verification. The originating agent can then resume automatically.

## Core loop

`agent blocked -> task posted -> worker claims -> evidence submitted -> verified -> paid -> agent resumes`

## Project control

- [Execution roadmap](docs/roadmap.md)
- [Current checkpoint](docs/checkpoints/CURRENT.md)
- [Checkpoint policy and archive](docs/checkpoints/README.md)

The roadmap defines the path to completion. `CURRENT.md` is the canonical handoff point for continuing work without reconstructing project state from chat history.

## Current status

Ground Relay has a working physical-Android prototype with:

- Solana Mobile Wallet Adapter connection through Solflare
- devnet claim receipt
- camera evidence capture
- SHA-256 evidence hashing
- devnet delivery receipt
- visible claim/delivery signatures and task progression

The custom Anchor escrow program now compiles, passes transition-guard tests, produces reproducible SBF + IDL artifacts, and has a controlled devnet deployment identity.

Controlled devnet program ID:

`6v2peeoZVj2AXfczVLqyMUTHYt3XQPqAxCktpTwjUZap`

The current milestone is the first real Anchor deployment to devnet. The proven mobile claim/delivery path is still memo-backed until the Anchor integration milestone is complete.

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
