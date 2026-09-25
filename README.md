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


## Checkpoint — 2026-09-25 15:12 BRT

Current Android standalone APK reaches the Ground Relay app, but crashes at startup inside `@wallet-ui/react-native-kit` / `MobileWalletProvider`.

Observed device error:
- `NativeModule: AsyncStorage is null`
- stack passes through `facebook::react::jni::JniException` and React Native startup.

Evidence from the release build shows AsyncStorage was autolinked and compiled, so the current working hypothesis is a native compatibility/version mismatch rather than a missing npm install.

Fix applied at this checkpoint:
- pinned `@react-native-async-storage/async-storage` to `2.2.0`
- pinned `@wallet-ui/react-native-kit` to `4.2.1`
- pinned `@solana-program/memo` to `0.12.0`
- pinned `@solana/kit` to `7.0.0`
- pinned `react-native-quick-crypto` to `1.1.6`
- pinned `react-native-nitro-modules` to `0.36.5`

These versions follow the Solana Mobile Expo Kit template compatibility line. Next action: let CI rebuild the standalone APK, install that artifact, and verify startup before changing application logic.


## Checkpoint — 2026-09-25 18:15 BRT

Android device validation is now successful through the memo-backed delivery flow.

Confirmed on a physical Android device:
- standalone APK starts without the AsyncStorage crash
- Solflare connects through Mobile Wallet Adapter
- worker address is returned to Ground Relay
- claim memo was signed and confirmed on Solana devnet
- camera evidence capture works
- SHA-256 evidence hashing works on-device
- delivery memo was signed and confirmed on Solana devnet
- app advances from OPEN -> CLAIMED -> DELIVERED and displays both receipts

Devnet proof transactions:
- claim: `23My4fQYQy3vp6YpkSPRfLFBMqkLuusmZJFN92pGB9mjjATAwKSamXjQVZxT8Giy3Ekii8QLeT8SofRzavKc3BTy`
- delivery: `5hycogT2MMUKfnXTuYgS1jgzvP6atyeBAEsEoEzpjGdFYUD4dXzB53EfUPHnqA6xwzVkLtw6krRwStDQyQKvEQGN`

Anchor escrow progress:
- Rust workspace manifest added at repository root
- dedicated Anchor CI now compiles the program
- 5 transition-guard tests pass for claim, evidence submission, acceptance, release and cancellation
- SBF + IDL artifact workflow has been added and is the current build target

Important limitation:
- the Android flow is still memo-backed; the displayed 1.00 USDC is not yet a real escrow payout
- do not replace the proven memo flow until the Anchor program has a reproducible SBF/IDL build and a safely controlled devnet deployment identity

Next action: finish the SBF + IDL CI build, then prepare integration/deployment without committing or exposing any private program or wallet keys.
