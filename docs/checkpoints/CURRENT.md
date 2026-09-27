# Current checkpoint

**UTC date:** 2026-09-27  
**Stage:** M9 — release/submission preparation  
**Repository:** `uknwplayer/ground-relay`  
**Working branch:** `m9-release-submission`  
**M8 merge commit on `main`:** `ffcb9b7d69e159ec05fd11139b02bbb442099299`

## Current state

M0 through M8 are complete. M8 was merged through PR #3 into `main`.

M9 release provenance and the physical clean-install gate are complete. The exact post-M8 Android release candidate was built from the integrated `main` commit and physically installed on Android. The app connected the worker wallet, discovered the completed proof task, reconciled the exact selected PDA against Solana devnet, displayed authoritative `PAID`, and kept the historical task read-only.

Ground Relay has therefore proved both the full hardened lifecycle and the release-candidate recovery/read path:

`agent blocked -> funded task -> worker claims -> camera evidence -> verifier accepts -> escrow pays worker -> agent resumes`

Physical task lifecycle:

`OPEN -> CLAIMED -> DELIVERED -> ACCEPTED -> PAID`

## Controlled devnet identity

Program ID:

`6v2peeoZVj2AXfczVLqyMUTHYt3XQPqAxCktpTwjUZap`

ProgramData:

`GKggYJQfNJsZn2EqtuasShdKVPKxWUNbv3zg61UPjJgR`

Current work remains devnet-only. No mainnet deployment is authorized by this checkpoint.

## Hardened physical proof

Task ID:

`m8-physical-2026-09-27-v1`

Task PDA:

`BT5sKaBENnaJx1FPmYTtLC7XEojDnVvXpR455cu1Np5y`

Vault PDA:

`F8vdvACWiaFCmh95HLEJGKVbZsXZ9Wvs5cd33qzbZysV`

Worker:

`7XY6t1adc9vmuefiEP25TsoEjxRkFhVxT4yQrtN5zr2C`

Reward:

`1,000,000` atomic = `0.001 WSOL`

Evidence SHA-256:

`87c1f0a74d733d3f7e197dc8eb2319bbcd1e55eadef00a4db7c84e64124aeed1`

Payout signature:

`UbpwAKQMUHmFyBGBF9Z7tq76LmS5oHtT8cyA27SG2ZRoWn7Hn4y57HDR9vPhGWNfw3o5deNEHwCeDYVxQYr2Qge`

Independent payout audit:

- worker WSOL: `1,000,000 -> 2,000,000` atomic;
- worker delta: `+1,000,000` atomic;
- vault: `1,000,000 -> 0` atomic;
- authoritative task state: `PAID`;
- verification run `36311952353` — PASS.

## Release candidate — VERIFIED ON DEVICE

Source commit:

`ffcb9b7d69e159ec05fd11139b02bbb442099299`

Android build:

`36329825769` — PASS

Artifact:

`ground-relay-standalone-apk` (`10935757058`)

APK SHA-256:

`cc4074f1dde807f9396e3aaf1a8bdb17d45cbc3bb568fd2ebad2bdfc58e09de4`

APK size:

`114,098,915` bytes

Worker API embedded in the release candidate:

`https://ground-relay-agent-gateway-m8.onrender.com/v1`

Physical clean-install result:

- fresh Ground Relay installation opened successfully;
- MWA-compatible worker wallet connected;
- completed hosted task was discoverable;
- exact PDA reconciled against Solana devnet;
- authoritative state displayed as `PAID`;
- escrow-paid receipt displayed;
- no historical payment action was reissued.

Detailed device gate:

`docs/checkpoints/archive/2026-09-27-m9-release-candidate-device-pass.md`

## Public screenshot decision

The earlier clean-install proof screenshot remains private verification evidence.

A separate, deliberate Android screenshot was then captured for public submission use and approved. It shows Ground Relay branding, the truncated worker wallet, `PAID`, reward amount, task title, selected PDA summary, authoritative worker line, `ESCROW PAID · DEVNET`, and restart-safety copy, without raw evidence content or unrelated notifications.

Use only this dedicated public capture for submission materials. Cosmetic cropping of Android system chrome is allowed; do not alter app content or fabricate state.

Screenshot guidance:

`docs/screenshots.md`

## Pitch deck — COMPLETE

The final judge-facing deck was generated from `docs/pitch-deck-outline.md` as an 8-slide 16:9 presentation and rendered/checked for overflow.

Binary handoff artifacts produced outside git:

- `ground-relay-pitch-deck-m9.pptx`
- `ground-relay-pitch-deck-m9.pdf`

The repository retains the editable narrative source in `docs/pitch-deck-outline.md`.

## Demo video — VISUAL CUT COMPLETE

A publication-safe Android screen recording was reviewed frame-by-frame. The non-app opening was removed, Android system chrome was cropped from the public mobile clip, and device ambient audio was discarded.

Public mobile clip:

- duration: `37.0s`
- SHA-256: `ebb80705aee7f9b8c3ce0aa3c25f71117b24306ad8965d22228a4070ebdb2e2c`
- content: authoritative `PAID`, refresh/reconciliation, receipt history, return to terminal task state

A 16:9 visual cut was then assembled from the final deck plus the reviewed Android clip:

- duration: `90.0s`
- resolution: `1920x1080`
- video: H.264
- audio track: silent AAC placeholder; no device ambient audio retained
- SHA-256: `3ecf85d766edec9df343ab48b7b448254b9d78ed0ca5c0be69c1141bb0e2f825`

The visual cut is ready for narration/voiceover. `docs/demo-script.md` remains the authoritative 90-second narration source.

## Reviewer/submission package now present

- `docs/release-candidate.md` — APK provenance and hashes
- `docs/reviewer-verification.md` — independent reviewer checks
- `docs/architecture.md` — current hardened architecture
- `docs/product-anatomy.md` — product/actor/trust model
- `docs/submission-copy.md` — hackathon copy
- `docs/demo-script.md` — 90-second narration/recording script
- `docs/screenshots.md` — screenshot plan and privacy rules
- `docs/pitch-deck-outline.md` — judge-facing deck narrative source

## M8/M9 verification highlights

- M8 final quality sweep `36313234829` — PASS
- mobile tests `106/106` — PASS
- Gateway tests `63/63` — PASS
- TypeScript typecheck — PASS
- Anchor/Rust workspace tests — PASS
- repository hygiene audit — PASS
- post-merge Android release build `36329825769` — PASS
- physical clean-install/reconciliation — PASS
- final pitch deck render/overflow check — PASS
- public mobile recording privacy/timing review — PASS
- 90-second visual cut duration/render check — PASS

## Do not repeat

- Do not regenerate the program identity.
- Do not overwrite deployment signing material.
- Do not reset, recreate, claim, or repay completed proof tasks.
- Do not use Gateway/cache state as transaction authorization.
- Do not commit wallet secrets, credentials, or signing material.
- Do not make the Agent Gateway a custodial signer.
- Do not describe callback transport as exactly-once.
- Do not infer mainnet readiness from devnet proof.

## Next recommended action

The remaining media gate is narration/voiceover for the already-complete 90-second visual cut.

After narration is available:

1. mix the narration into the 90-second visual cut and verify final loudness/timing;
2. publish/host the final demo and place its URL into the submission copy;
3. run one final documentation/link/release audit;
4. open the M9 PR for review;
5. submit only after repository, APK, screenshot, deck, and final video references are stable.
