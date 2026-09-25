# Ground Relay

Ground Relay is a mobile-first human escalation network for autonomous agents, built for **CLOCK IN — A Solana Mobile Hackathon**.

Autonomous agents can stall when a workflow needs a human-only, device-local, or real-world action. Ground Relay turns that blocker into a structured microtask, lets an Android/Seeker user claim it, capture evidence, and receive a Solana payout after verification. The originating agent then resumes automatically.

## Core loop

`agent blocked → task posted → worker claims → evidence submitted → verified → paid → agent resumes`

## Hackathon target

- Android APK
- Mobile Wallet Adapter
- Solana devnet task receipts and settlement
- Public source
- Demo video
- Short pitch deck
- Optional SKR-backed reputation

## Current status

This repository contains the first mobile bootstrap:

- React Native / Expo Android app shell
- Solana Mobile Wallet Adapter provider
- Wallet connect/disconnect
- Devnet claim receipt using a Solana memo transaction
- Local task state progression for demo development
- Shared task protocol types and state machine

The next milestone replaces the memo-only claim receipt with the escrow/task program.

## Run locally

Ground Relay uses Solana Mobile native modules, so **Expo Go is not sufficient**. Use an Android emulator/device and a custom development build.

```bash
npm install
npm run android
```

Install an MWA-compatible development wallet on the Android device/emulator before testing wallet flows.

## Security

- Development defaults to Solana devnet.
- Never commit private keys, seed phrases, wallet secrets, or auth tokens.
- Evidence payloads stay off-chain. Only hashes/receipts/state references should be committed on-chain.
- The worker does not need to post a deposit to participate.

## License

MIT
