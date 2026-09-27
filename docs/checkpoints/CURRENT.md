# Current checkpoint

**UTC date:** 2026-09-27  
**Stage:** M9 — release/submission preparation  
**Repository:** `uknwplayer/ground-relay`  
**Working branch:** `m9-release-submission`  
**M8 merge commit on `main`:** `ffcb9b7d69e159ec05fd11139b02bbb442099299`

## Current state

M5, M6, M7, and M8 are complete. M8 was merged through PR #3 and `main` points at the verified integration commit above.

Ground Relay has physically proved the hardened devnet loop on a fresh non-canonical task:

`hosted inbox -> select -> claim -> restart/recovery -> camera evidence -> DELIVERED -> poster ACCEPTED -> generic verified payout -> PAID reconciliation`

The proof also exercised a real post-wallet DNS/RPC failure. The payout had already reached Solana, the app did not replay the transaction, and the Android UI later reconciled to `PAID` after network recovery.

M9 is now focused on release provenance, clean-device verification, reviewer-facing proof instructions, README/architecture polish, and submission media. Runtime changes are deferred unless they materially improve reviewer UX without touching payment authorization.

## Controlled devnet identity

Program ID:

`6v2peeoZVj2AXfczVLqyMUTHYt3XQPqAxCktpTwjUZap`

Controlled upgrade/deployer/poster:

`6WG3UpKV9vBRh4XR961eZGpPZcHVGdxqpM3Eten5quuZ`

Canonical ProgramData:

`GKggYJQfNJsZn2EqtuasShdKVPKxWUNbv3zg61UPjJgR`

Do not regenerate the program identity or replace deployment Secrets.

## M8 completion evidence

- M8 final quality sweep `36313234829` — PASS
- root mobile tests `106/106` — PASS
- Gateway tests `63/63` — PASS
- TypeScript typecheck — PASS
- deterministic Gateway resume demo — PASS
- Anchor/Rust workspace tests — PASS
- repository hygiene audit — PASS
- PR #3 merged to `main` at `ffcb9b7d69e159ec05fd11139b02bbb442099299`

Detailed completion record:

`docs/checkpoints/archive/2026-09-27-m8-complete.md`

## Fresh physical proof

Gateway task ID: `m8-physical-2026-09-27-v1`

Task PDA:

`BT5sKaBENnaJx1FPmYTtLC7XEojDnVvXpR455cu1Np5y`

Vault PDA:

`F8vdvACWiaFCmh95HLEJGKVbZsXZ9Wvs5cd33qzbZysV`

Worker:

`7XY6t1adc9vmuefiEP25TsoEjxRkFhVxT4yQrtN5zr2C`

Reward mint:

`So11111111111111111111111111111111111111112`

Reward:

`1,000,000` atomic = `0.001 WSOL`

Evidence SHA-256:

`87c1f0a74d733d3f7e197dc8eb2319bbcd1e55eadef00a4db7c84e64124aeed1`

Payout signature:

`UbpwAKQMUHmFyBGBF9Z7tq76LmS5oHtT8cyA27SG2ZRoWn7Hn4y57HDR9vPhGWNfw3o5deNEHwCeDYVxQYr2Qge`

Exact payout verification:

- worker WSOL: `1,000,000 -> 2,000,000` atomic
- worker delta: `+1,000,000` atomic
- vault: `1,000,000 -> 0` atomic
- authoritative task state: `PAID`
- verification run `36311952353` — PASS

Detailed proof record:

`docs/checkpoints/archive/2026-09-27-m8-physical-paid.md`

## Hosted Gateway

Base URL:

`https://ground-relay-agent-gateway-m8.onrender.com`

Worker API:

`https://ground-relay-agent-gateway-m8.onrender.com/v1`

The persisted physical-proof seed is terminalized as `PAID`; a cold start must not re-advertise it as fresh work.

## M9 release candidate

The post-M8 integrated `main` state produced a standalone Android release APK.

Source commit:

`ffcb9b7d69e159ec05fd11139b02bbb442099299`

Android run:

`36329825769` — **PASS**

Artifact:

`ground-relay-standalone-apk` (`10935757058`)

GitHub ZIP digest and locally downloaded ZIP SHA-256:

`5d273aa2b8c56f4775c797f3a16b257cc4dc3c468d43c3303382e43426b565b2`

APK size:

`114,098,915` bytes

APK SHA-256:

`cc4074f1dde807f9396e3aaf1a8bdb17d45cbc3bb568fd2ebad2bdfc58e09de4`

Raw APK inspection confirmed the intended Gateway URL exactly once:

`https://ground-relay-agent-gateway-m8.onrender.com/v1`

Detailed provenance:

`docs/release-candidate.md`

Reviewer verification kit:

`docs/reviewer-verification.md`

## M9 plan

`docs/superpowers/plans/2026-09-27-m9-release-submission.md`

## Do not repeat

- Do **not** run devnet identity bootstrap again.
- Do **not** regenerate the program keypair.
- Do **not** overwrite deployment GitHub Secrets.
- Do **not** reset/recreate or repay either paid physical proof task.
- Do **not** treat Gateway/cache state as transaction authorization.
- Do **not** commit keys, seed phrases, wallet secrets, or auth tokens.
- Do **not** make the Agent Gateway a custodial signer.
- Do **not** describe HTTP callback transport as exactly-once.
- Do **not** authorize mainnet deployment from this checkpoint.

## Next recommended action

Human-controlled clean-install gate for the exact M9 APK:

1. remove/clear the previous Ground Relay installation;
2. install the exact release candidate APK with SHA-256 `cc4074f1dde807f9396e3aaf1a8bdb17d45cbc3bb568fd2ebad2bdfc58e09de4`;
3. open and connect an MWA-compatible wallet;
4. refresh the inbox and open the completed M8 proof task;
5. verify authoritative `PAID` reconciliation;
6. close/reopen once and confirm safe context restoration;
7. do not issue any new historical-task transaction.

After this gate passes, proceed with reviewer-facing README polish, the 90-second demo/video package, screenshots, pitch deck, and final submission copy.
