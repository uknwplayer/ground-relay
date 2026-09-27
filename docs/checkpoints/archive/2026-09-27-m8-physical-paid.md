# M8 Fresh Physical Proof — On-chain PAID

**UTC date:** 2026-09-27  
**Branch:** `m8-product-hardening`  
**Stage:** M8 — product hardening  
**Status:** fresh physical task is authoritatively PAID; final device-side terminal reconciliation/restart still pending because the Android device hit a DNS failure after payout.

## Fresh task

- Gateway task ID: `m8-physical-2026-09-27-v1`
- task PDA: `BT5sKaBENnaJx1FPmYTtLC7XEojDnVvXpR455cu1Np5y`
- vault PDA: `F8vdvACWiaFCmh95HLEJGKVbZsXZ9Wvs5cd33qzbZysV`
- worker: `7XY6t1adc9vmuefiEP25TsoEjxRkFhVxT4yQrtN5zr2C`
- worker WSOL ATA: `2fm8p8DpCeJvcpvNbCpzURRezQthF2z2yQARLgPgZfu6`
- mint: `So11111111111111111111111111111111111111112`
- reward: `1,000,000` atomic = `0.001 WSOL`
- evidence hash: `87c1f0a74d733d3f7e197dc8eb2319bbcd1e55eadef00a4db7c84e64124aeed1`

## Physical path proven

The Android worker completed:

`hosted inbox -> select -> claim -> restart/recovery -> camera evidence -> DELIVERED`

Poster acceptance was executed by the controlled devnet workflow after the physical DELIVERED proof:

- acceptance workflow run: `36311385406` — PASS
- acceptance signature: `2e9xNS5DxU1a6i6cXYpWMHvWqsyGHkvLZtpUM74wmQQJh581BzJSd6fLcgm2yL7accFb3uap8mjbCSE8AfPpRC1C`
- post-acceptance Gateway status: `accepted`

## Device payout symptom

The Android device attempted the worker payout. After the wallet flow, the app displayed:

`java.net.UnknownHostException: Unable to resolve host "api.devnet.solana.com": No address associated with hostname`

Because the authoritative reconciliation read could not resolve the Solana devnet RPC hostname, the app remained fail-closed and showed stale discovery state from the worker inbox. The stale `OPEN` presentation is not authoritative chain state.

Do not retry payout merely because of this UI state.

## Independent post-failure chain verification

An idempotent post-failure check re-read the exact task from Solana and found:

- authoritative task status: `paid`
- Gateway sync result: `paid`
- no second acceptance transaction was sent
- verification workflow run: `36311843338` — PASS

## Exact payout transaction proof

A dedicated verifier located the confirmed `ReleasePayment` transaction and checked transaction token-balance deltas directly.

Verification workflow:

- `M8 final paid verify`
- run `36311952353`
- result: PASS

Payout signature:

`UbpwAKQMUHmFyBGBF9Z7tq76LmS5oHtT8cyA27SG2ZRoWn7Hn4y57HDR9vPhGWNfw3o5deNEHwCeDYVxQYr2Qge`

Confirmed slot:

`504746194`

Worker WSOL ATA transaction balances:

- before: `1,000,000`
- after: `2,000,000`
- delta: `+1,000,000` atomic = `+0.001 WSOL`

Vault transaction balances:

- before: `1,000,000`
- after: `0`
- delta: `-1,000,000` atomic

Live post-transaction balances at verification time:

- worker WSOL ATA: `2,000,000`
- vault: `0`
- task state: `PAID`

This proves the payout succeeded before the Android post-transaction RPC reconciliation failed.

## Remaining physical M8 check

Restore working DNS/network access on the Android device, then:

1. reopen Ground Relay;
2. refresh/reconcile the selected task;
3. verify the UI reaches authoritative `PAID` without sending any state-changing transaction;
4. force-close and reopen once more;
5. verify the terminal receipt/history restores and no transaction is replayed.

After that, continue with the final M8 recovery/security/demo sweep before declaring M8 complete.

## Safety

- Do not retry `release_payment`; it is already confirmed.
- Do not claim the stale `OPEN` presentation.
- Do not reset the fresh task or historical canonical task.
- No mainnet action is authorized by this proof.
