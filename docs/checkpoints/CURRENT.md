# Current checkpoint

**UTC date:** 2026-09-27  
**Stage:** M9 — release/submission preparation  
**Repository:** `uknwplayer/ground-relay`  
**Working branch:** `m9-release-submission`  
**M8 merge commit on `main`:** `ffcb9b7d69e159ec05fd11139b02bbb442099299`

## Current state

M0 through M8 are complete. M8 was merged through PR #3 into `main`.

M9 release provenance and the physical clean-install gate are now complete. The exact post-M8 Android release candidate was built from the integrated `main` commit and physically installed on Android. The app connected the worker wallet, discovered the completed proof task, reconciled the exact selected PDA against Solana devnet, displayed authoritative `PAID`, and kept the historical task read-only.

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

## Reviewer/submission package now present

- `docs/release-candidate.md` — APK provenance and hashes
- `docs/reviewer-verification.md` — independent reviewer checks
- `docs/architecture.md` — current hardened architecture
- `docs/product-anatomy.md` — product/actor/trust model
- `docs/submission-copy.md` — hackathon copy
- `docs/demo-script.md` — 90-second recording script
- `docs/screenshots.md` — screenshot plan and privacy rules
- `docs/pitch-deck-outline.md` — judge-facing deck structure

## M8/M9 verification highlights

- M8 final quality sweep `36313234829` — PASS
- mobile tests `106/106` — PASS
- Gateway tests `63/63` — PASS
- TypeScript typecheck — PASS
- Anchor/Rust workspace tests — PASS
- repository hygiene audit — PASS
- post-merge Android release build `36329825769` — PASS
- physical clean-install/reconciliation — PASS

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

Finish the presentation layer without changing settlement behavior:

1. finalize README reviewer start-here section;
2. prepare publication-safe screenshots from the approved screenshot plan;
3. turn `docs/pitch-deck-outline.md` into the final deck;
4. record/edit the 90-second demo using `docs/demo-script.md`;
5. fill the actual hackathon submission form with `docs/submission-copy.md`;
6. run one final documentation/link/release audit;
7. submit only after the public screenshots, video, deck, repository, and APK references are final.

Publishing a user-device screenshot is a separate privacy decision; do not place the current device capture in the public repository without explicit approval.
