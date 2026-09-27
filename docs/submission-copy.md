# Ground Relay — Submission Copy

## One-line pitch

Ground Relay lets autonomous agents hand off a real-world or mobile-only step to a human worker, pay through Solana escrow, and resume the workflow only after verified settlement.

## Short description

Autonomous workflows still stall when a step requires a person, a phone, or the physical world. Ground Relay turns that blocker into a funded mobile microtask. An Android worker discovers the task, connects through Solana Mobile Wallet Adapter, claims the on-chain task, captures evidence, and submits a task-bound SHA-256 hash. After verification, the Anchor escrow pays the worker and the Agent Gateway resumes the originating workflow after Solana reports `PAID`.

## Full description

Ground Relay is a mobile-first human escalation network for autonomous agents, built for CLOCK IN — A Solana Mobile Hackathon.

When an autonomous workflow reaches a human-only blocker, Ground Relay converts it into a funded task with explicit acceptance criteria. The worker sees the task in an Android inbox, connects an MWA-compatible wallet, claims the exact on-chain task PDA, captures fresh evidence on the phone, and submits only a SHA-256 digest to the protocol. The verifier accepts the delivery, the Anchor program releases the escrowed SPL-token reward, and the Agent Gateway resumes the blocked workflow after authoritative settlement.

The project physically completed the full devnet lifecycle:

`OPEN -> CLAIMED -> DELIVERED -> ACCEPTED -> PAID`

The hardened proof also exercised a real mobile network failure after wallet submission. The payment had already reached Solana; the app did not replay it and later reconciled safely to `PAID`.

## Why Solana Mobile matters

- wallet authorization happens through Mobile Wallet Adapter;
- camera evidence is captured on the Android device;
- raw photo bytes remain local rather than becoming protocol state;
- the selected task is reconciled against Solana before actions unlock;
- ambiguous wallet returns are resolved from authoritative chain state.

## Architecture

1. **Android worker app** — inbox, wallet connection, task selection, camera evidence, receipts, safe restart recovery, and payout verification.
2. **Agent Gateway** — durable task discovery and task/PDA binding, Solana synchronization, retryable resume events, and workflow handoff.
3. **Anchor escrow program** — funded task state machine, task/vault PDAs, token-account checks, lifecycle recovery, payout, and terminal receipts.

## Verified devnet proof

Program ID:

`6v2peeoZVj2AXfczVLqyMUTHYt3XQPqAxCktpTwjUZap`

Fresh hardened task PDA:

`BT5sKaBENnaJx1FPmYTtLC7XEojDnVvXpR455cu1Np5y`

Payout signature:

`UbpwAKQMUHmFyBGBF9Z7tq76LmS5oHtT8cyA27SG2ZRoWn7Hn4y57HDR9vPhGWNfw3o5deNEHwCeDYVxQYr2Qge`

Verified token movement:

- worker WSOL: `1,000,000 -> 2,000,000` atomic;
- worker delta: `+1,000,000` atomic = `+0.001 WSOL`;
- vault: `1,000,000 -> 0` atomic;
- final task state: `PAID`.

Independent payout verification: GitHub Actions run `36311952353` — PASS.

## Release candidate

Source commit:

`ffcb9b7d69e159ec05fd11139b02bbb442099299`

Android build:

`36329825769` — PASS

APK SHA-256:

`cc4074f1dde807f9396e3aaf1a8bdb17d45cbc3bb568fd2ebad2bdfc58e09de4`

The exact APK passed a clean physical Android installation and read-only reconciliation of the completed proof task to `PAID`.

## Demo video

Final narrated 90-second demo:

`https://drive.google.com/file/d/1WVVwYWnvEmRWtLEj9Adk2Zwx1angzDFy/view?usp=drivesdk`

Demo SHA-256:

`e3677b90103c37cf57f56057feed787dc156b2dab1679377b1b31d968a2e208d`

The final master is 90.0 seconds, 1920x1080, H.264 video with AAC stereo narration, and uses only the approved publication-safe Android footage.

## Suggested tags

Solana Mobile, Android, Mobile Wallet Adapter, Anchor, SPL Token, escrow, autonomous agents, human-in-the-loop, physical-world tasks, agent infrastructure

## Reviewer start-here

- `README.md`
- `docs/reviewer-verification.md`
- `docs/architecture.md`
- `docs/product-anatomy.md`
- `docs/checkpoints/archive/2026-09-27-m9-release-candidate-device-pass.md`
