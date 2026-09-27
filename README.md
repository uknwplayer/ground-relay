# Ground Relay

**Human execution for the one step an autonomous agent cannot do.**

Ground Relay is a mobile-first human escalation network built for **CLOCK IN — A Solana Mobile Hackathon**. When an autonomous workflow hits a step that requires a person, a phone, or the physical world, Ground Relay turns that blocker into a funded task, lets an Android worker complete it, settles the reward through Solana escrow, and resumes the originating workflow only after authoritative settlement.

## The loop

`agent blocked -> funded task -> worker claims -> evidence -> verifier accepts -> escrow pays worker -> agent resumes`

The hardened devnet lifecycle has been physically completed on Android:

`OPEN -> CLAIMED -> DELIVERED -> ACCEPTED -> PAID`

## Reviewer start here

| Goal | Document |
| --- | --- |
| Verify the proof quickly | **[Reviewer Verification](docs/reviewer-verification.md)** |
| Understand the system | **[Architecture](docs/architecture.md)** |
| Understand actors, trust boundaries, and use cases | **[Product Anatomy](docs/product-anatomy.md)** |
| Inspect the exact release candidate | **[Release Candidate](docs/release-candidate.md)** |
| See the current project handoff | **[Current Checkpoint](docs/checkpoints/CURRENT.md)** |
| Read the hackathon submission copy | **[Submission Copy](docs/submission-copy.md)** |
| Follow the 90-second demo | **[Demo Script](docs/demo-script.md)** |
| Review the pitch structure | **[Pitch Deck Outline](docs/pitch-deck-outline.md)** |
| Review screenshot guidance | **[Screenshot Plan](docs/screenshots.md)** |

## What the mobile app does

The Android worker app:

- discovers tasks through the hosted worker inbox;
- connects an MWA-compatible wallet;
- selects and reconciles the exact task PDA against Solana;
- claims funded work;
- captures evidence with the phone camera;
- keeps raw photo bytes off-chain and submits a task-bound SHA-256 digest;
- shows authoritative lifecycle receipts;
- derives and verifies payout accounts before payment actions unlock;
- restores only safe context after restart and never automatically replays a transaction;
- fails closed if the selected on-chain task cannot be verified.

## Architecture

Ground Relay has three cooperating pieces:

### Android worker app

Mobile Wallet Adapter, inbox, task selection, camera evidence, receipt history, restart recovery, and payout verification.

### Agent Gateway

Durable task discovery, task/PDA binding, Solana synchronization, retryable resume events, and agent handoff. The Gateway does not sign worker settlement transactions.

### Anchor escrow program

Funded task state machine, canonical task/vault PDAs, lifecycle guards, exact token-account checks, recovery paths, payout/refund handling, and durable terminal receipts.

See **[docs/architecture.md](docs/architecture.md)** for the full state and trust model.

## Verified devnet settlement

Program ID:

`6v2peeoZVj2AXfczVLqyMUTHYt3XQPqAxCktpTwjUZap`

Fresh hardened task PDA:

`BT5sKaBENnaJx1FPmYTtLC7XEojDnVvXpR455cu1Np5y`

Reward:

`1,000,000` atomic = `0.001 WSOL`

Payout signature:

`UbpwAKQMUHmFyBGBF9Z7tq76LmS5oHtT8cyA27SG2ZRoWn7Hn4y57HDR9vPhGWNfw3o5deNEHwCeDYVxQYr2Qge`

Independent payout verification confirmed:

- worker WSOL: `1,000,000 -> 2,000,000` atomic;
- worker delta: `+1,000,000` atomic;
- vault: `1,000,000 -> 0` atomic;
- final authoritative task state: `PAID`.

Verification run: `36311952353` — PASS.

Detailed proof:

- [Fresh M8 physical payout](docs/checkpoints/archive/2026-09-27-m8-physical-paid.md)
- [M8 completion record](docs/checkpoints/archive/2026-09-27-m8-complete.md)

## Real mobile failure recovery

During the physical payout, the phone lost DNS/RPC access after the wallet transaction had already reached Solana.

Ground Relay did not replay the payment. Independent chain verification found the task `PAID`, and the Android UI later reconciled to the same terminal state after network recovery. A regression test then removed the misleading fallback that could display stale inbox status while authoritative RPC state was unavailable.

Regression evidence:

- RED: `36312405844`
- GREEN: `36312595528`

This is a core design rule: **when mobile return paths are ambiguous, chain state wins.**

## M9 release candidate

M8 was integrated into `main` through PR #3.

Source commit:

`ffcb9b7d69e159ec05fd11139b02bbb442099299`

Android release build:

`36329825769` — PASS

Artifact:

`ground-relay-standalone-apk` (`10935757058`)

APK SHA-256:

`cc4074f1dde807f9396e3aaf1a8bdb17d45cbc3bb568fd2ebad2bdfc58e09de4`

The exact APK passed a clean physical Android installation, wallet connection, hosted-task discovery, exact-PDA reconciliation, and terminal `PAID` readback without reissuing any historical transaction.

Device verification record:

[docs/checkpoints/archive/2026-09-27-m9-release-candidate-device-pass.md](docs/checkpoints/archive/2026-09-27-m9-release-candidate-device-pass.md)

## Verification highlights

- M6 lifecycle guards `36208008464` — PASS
- M7 post-merge Gateway `36249541738` — PASS
- Anchor SBF + IDL `36288500115` — PASS
- IDL client consistency `36289499220` — PASS
- hardened devnet upgrade `36294101421`, attempt 2 — PASS
- independent post-deploy preflight `36296153445`, attempt 2 — PASS
- hosted Gateway smoke `36303711875` — PASS
- fresh task creation/binding `36303227689` — PASS
- exact payout audit `36311952353` — PASS
- M8 consolidated quality sweep `36313234829` — PASS
- post-merge Android release `36329825769` — PASS
- physical clean-install/reconciliation — PASS

M8 final sweep included `106/106` mobile tests, `63/63` Gateway tests, TypeScript typecheck, deterministic Gateway demo, Anchor workspace tests, and repository hygiene.

## Run locally

Ground Relay uses Solana Mobile native modules, so **Expo Go is not sufficient**. Use an Android emulator/device and a native build.

```bash
npm install
npm test
npm run typecheck
npm run android
```

Configure the worker API when building locally:

```bash
EXPO_PUBLIC_GROUND_RELAY_GATEWAY_URL=http://<gateway-host>:8787/v1
```

Run Gateway checks:

```bash
cd gateway
npm ci
npm test
npm run demo
```

## Project boundaries

- Current deployment and proof target Solana devnet.
- Solana is authoritative after task binding.
- Gateway/cache state is discovery and recovery context, not transaction authorization.
- Raw evidence photo bytes remain off-chain.
- The Gateway is non-custodial.
- Completed proof tasks are historical receipts and must not be reset or presented as fresh work.
- No mainnet deployment is implied or authorized by the current proof.

## Current stage

**M9 — release/submission preparation.**

Release provenance and physical clean-install verification are complete. Remaining work is presentation-layer only: publication-safe screenshots, final pitch deck, 90-second demo video, final submission audit, and submission.

See **[docs/checkpoints/CURRENT.md](docs/checkpoints/CURRENT.md)** for the exact handoff.

## License

MIT
