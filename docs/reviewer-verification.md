# Ground Relay reviewer verification

This guide gives a reviewer one public path to verify the current Ground Relay devnet proof without private keys, local state, or trust in a cached Gateway status.

## 1. Verify the integrated source state

Repository:

`https://github.com/uknwplayer/ground-relay`

M8 integration PR:

`https://github.com/uknwplayer/ground-relay/pull/3`

Verified merge commit on `main`:

`ffcb9b7d69e159ec05fd11139b02bbb442099299`

Commit:

`https://github.com/uknwplayer/ground-relay/commit/ffcb9b7d69e159ec05fd11139b02bbb442099299`

Final M8 consolidated sweep:

`https://github.com/uknwplayer/ground-relay/actions/runs/36313573316`

Expected result: mobile/root tests, TypeScript typecheck, Gateway tests/demo, Anchor workspace tests, and repository hygiene all pass.

## 2. Verify the controlled Solana devnet program

Program ID:

`6v2peeoZVj2AXfczVLqyMUTHYt3XQPqAxCktpTwjUZap`

ProgramData:

`GKggYJQfNJsZn2EqtuasShdKVPKxWUNbv3zg61UPjJgR`

Hardened deployment verification:

- Anchor SBF + IDL: `https://github.com/uknwplayer/ground-relay/actions/runs/36288500115`
- IDL client consistency: `https://github.com/uknwplayer/ground-relay/actions/runs/36289499220`
- hardened upgrade: `https://github.com/uknwplayer/ground-relay/actions/runs/36294101421`
- independent post-deploy preflight: `https://github.com/uknwplayer/ground-relay/actions/runs/36296153445`

Solana Explorer program view:

`https://explorer.solana.com/address/6v2peeoZVj2AXfczVLqyMUTHYt3XQPqAxCktpTwjUZap?cluster=devnet`

## 3. Verify the fresh hardened physical task

Gateway task ID:

`m8-physical-2026-09-27-v1`

Task PDA:

`BT5sKaBENnaJx1FPmYTtLC7XEojDnVvXpR455cu1Np5y`

Vault PDA:

`F8vdvACWiaFCmh95HLEJGKVbZsXZ9Wvs5cd33qzbZysV`

Worker:

`7XY6t1adc9vmuefiEP25TsoEjxRkFhVxT4yQrtN5zr2C`

Worker WSOL ATA:

`2fm8p8DpCeJvcpvNbCpzURRezQthF2z2yQARLgPgZfu6`

Reward mint:

`So11111111111111111111111111111111111111112`

Reward:

`1,000,000` atomic = `0.001 WSOL`

Evidence SHA-256:

`87c1f0a74d733d3f7e197dc8eb2319bbcd1e55eadef00a4db7c84e64124aeed1`

Task account:

`https://explorer.solana.com/address/BT5sKaBENnaJx1FPmYTtLC7XEojDnVvXpR455cu1Np5y?cluster=devnet`

## 4. Verify acceptance and payout

Acceptance signature:

`2e9xNS5DxU1a6i6cXYpWMHvWqsyGHkvLZtpUM74wmQQJh581BzJSd6fLcgm2yL7accFb3uap8mjbCSE8AfPpRC1C`

Acceptance transaction:

`https://explorer.solana.com/tx/2e9xNS5DxU1a6i6cXYpWMHvWqsyGHkvLZtpUM74wmQQJh581BzJSd6fLcgm2yL7accFb3uap8mjbCSE8AfPpRC1C?cluster=devnet`

Payout signature:

`UbpwAKQMUHmFyBGBF9Z7tq76LmS5oHtT8cyA27SG2ZRoWn7Hn4y57HDR9vPhGWNfw3o5deNEHwCeDYVxQYr2Qge`

Payout transaction:

`https://explorer.solana.com/tx/UbpwAKQMUHmFyBGBF9Z7tq76LmS5oHtT8cyA27SG2ZRoWn7Hn4y57HDR9vPhGWNfw3o5deNEHwCeDYVxQYr2Qge?cluster=devnet`

Independent exact-balance audit:

`https://github.com/uknwplayer/ground-relay/actions/runs/36311952353`

Expected exact deltas:

- worker WSOL ATA: `1,000,000 -> 2,000,000` atomic;
- worker delta: `+1,000,000` atomic;
- vault: `1,000,000 -> 0` atomic;
- final authoritative task state: `PAID`.

Detailed proof record:

`https://github.com/uknwplayer/ground-relay/blob/main/docs/checkpoints/archive/2026-09-27-m8-physical-paid.md`

## 5. Verify the real recovery case

The physical Android payout encountered a DNS/RPC failure after the wallet transaction had already reached Solana. Ground Relay did not replay the payout.

Evidence:

- post-device-failure authoritative paid check: `https://github.com/uknwplayer/ground-relay/actions/runs/36311843338`
- stale-authority regression RED: `https://github.com/uknwplayer/ground-relay/actions/runs/36312405844`
- regression GREEN after fix: `https://github.com/uknwplayer/ground-relay/actions/runs/36312595528`

Expected behavior after the fix: when the RPC cannot be reached, the selected-task display is unreconciled/unknown and state-changing actions remain locked. Gateway/cache `OPEN` status is never presented as authoritative for the selected task.

## 6. Verify the hosted Gateway

Hosted Gateway:

`https://ground-relay-agent-gateway-m8.onrender.com`

Health:

`https://ground-relay-agent-gateway-m8.onrender.com/health`

Worker inbox API:

`https://ground-relay-agent-gateway-m8.onrender.com/v1/tasks`

Hosted smoke verification:

`https://github.com/uknwplayer/ground-relay/actions/runs/36303711875`

The persisted physical-proof task is terminalized as `PAID`; a cold start must not re-advertise it as fresh work.

## 7. Verify the Android release candidate

M9 post-merge Android build run:

`https://github.com/uknwplayer/ground-relay/actions/runs/36329825769`

Artifact name:

`ground-relay-standalone-apk`

The exact APK SHA-256 and fresh-device verification status are recorded in `docs/release-candidate.md` after the build artifact is downloaded and inspected.

## Safety notes for reviewers

- Current program/deployment evidence is **devnet only**.
- Do not send mainnet funds to any address in this repository.
- Do not retry the historical M8 payout; it is already `PAID`.
- No private key, seed phrase, wallet secret, deployment keypair, or auth token is needed to verify the public proof.
- The Agent Gateway is non-custodial and does not sign settlement transactions.
- Solana state is authoritative after a task is bound; Gateway/cache state is discovery and recovery context only.
