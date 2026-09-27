# Current checkpoint

**UTC date:** 2026-09-27  
**Stage:** M10 — hackathon submitted / judging  
**Repository:** `uknwplayer/ground-relay`  
**Working branch:** `m10-hackathon-submission`  
**M9 merge commit on `main`:** `d8e059eb0bacff169c017cb9e45b579779cc9ac8`

## Current state

Ground Relay has been officially submitted to **CLOCK IN — A Solana Mobile Hackathon** through the submission portal.

M0 through M9 are complete. M9 was merged into `main` through PR #4 before submission.

The submitted package includes:

- public GitHub repository;
- verified Android APK release candidate;
- public 90-second narrated demo;
- public pitch deck;
- reviewer-first documentation and verification records.

Submission record:

`docs/checkpoints/archive/2026-09-27-clock-in-submitted.md`

## Submitted links

Repository:

`https://github.com/uknwplayer/ground-relay`

Demo video:

`https://drive.google.com/file/d/1WVVwYWnvEmRWtLEj9Adk2Zwx1angzDFy/view?usp=drivesdk`

Pitch deck:

`https://drive.google.com/file/d/1Hh0HLigJ68S5WNVOAX7AljClDH1VIg41/view?usp=drivesdk`

Android APK:

`https://drive.google.com/file/d/1H8a0vR3zVxafEXMH2zwVn1aiCWEdSb3P/view?usp=drivesdk`

## Release candidate identity

Source commit:

`ffcb9b7d69e159ec05fd11139b02bbb442099299`

Android build:

`36329825769` — PASS

APK SHA-256:

`cc4074f1dde807f9396e3aaf1a8bdb17d45cbc3bb568fd2ebad2bdfc58e09de4`

APK size:

`114,098,915` bytes

Final demo SHA-256:

`e3677b90103c37cf57f56057feed787dc156b2dab1679377b1b31d968a2e208d`

## Verified physical proof

Ground Relay physically completed the hardened Android + Solana devnet lifecycle:

`OPEN -> CLAIMED -> DELIVERED -> ACCEPTED -> PAID`

Task PDA:

`BT5sKaBENnaJx1FPmYTtLC7XEojDnVvXpR455cu1Np5y`

Reward:

`1,000,000` atomic = `0.001 WSOL`

Payout signature:

`UbpwAKQMUHmFyBGBF9Z7tq76LmS5oHtT8cyA27SG2ZRoWn7Hn4y57HDR9vPhGWNfw3o5deNEHwCeDYVxQYr2Qge`

Independent payout audit:

- worker WSOL: `1,000,000 -> 2,000,000` atomic;
- vault: `1,000,000 -> 0` atomic;
- authoritative task state: `PAID`;
- verification run `36311952353` — PASS.

## Submission declarations

- prior VC/angel funding: NO
- built in the last 3 months: YES
- previous hackathon win with this project: N/A
- SKR integration: NO
- submission remains devnet-backed; no mainnet deployment was claimed

## Post-submission guardrails

- Do not regenerate the program identity.
- Do not reset, recreate, claim, or repay completed proof tasks.
- Do not change the submitted APK, demo, or public proof references during judging unless the rules explicitly allow it and there is a concrete reason.
- Do not infer mainnet readiness from devnet proof.
- Prefer stability and traceability over new feature work while judging is active.

## Next recommended action

Judging/watch phase.

Monitor the hackathon portal and registered email for requests, judging updates, finalist announcements, or clarification questions. Prepare concise technical answers from the existing reviewer documentation rather than changing the submitted build unless an organizer explicitly requires an update.
