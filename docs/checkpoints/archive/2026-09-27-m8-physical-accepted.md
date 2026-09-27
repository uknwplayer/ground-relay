# M8 Physical Proof — Accepted

**UTC date:** 2026-09-27
**Branch:** `m8-product-hardening`
**Status:** fresh physical task accepted; generic payout pending worker action

## Fresh task

- Gateway task ID: `m8-physical-2026-09-27-v1`
- Task PDA: `BT5sKaBENnaJx1FPmYTtLC7XEojDnVvXpR455cu1Np5y`
- Worker: `7XY6t1adc9vmuefiEP25TsoEjxRkFhVxT4yQrtN5zr2C`
- Reward: `1,000,000` atomic = `0.001 WSOL` on devnet
- Evidence hash: `87c1f0a74d733d3f7e197dc8eb2319bbcd1e55eadef00a4db7c84e64124aeed1`

## Physical delivery evidence

The Android worker app showed authoritative state `DELIVERED` for the fresh M8 task after claim, restart/recovery, in-app camera capture, and Anchor evidence submission.

## Poster acceptance

GitHub Actions workflow: `M8 accept physical task`
Run: `36311385406`
Result: PASS

State before acceptance: `delivered`
State after acceptance: `accepted`
Gateway state after sync: `accepted`

`accept_task` signature:

`2e9xNS5DxU1a6i6cXYpWMHvWqsyGHkvLZtpUM74wmQQJh581BzJSd6fLcgm2yL7accFb3uap8mjbCSE8AfPpRC1C`

The acceptance helper verified the controlled poster, worker, fresh task PDA, and evidence hash before submitting the transaction. Temporary poster key material was removed at the end of the job.

## Next action

On the Android device:

1. refresh/reconcile the selected on-chain task;
2. verify the UI reports authoritative `ACCEPTED`;
3. allow the app to derive and verify the generic payout context;
4. release the payment only if all payout checks are green;
5. approve the worker-wallet transaction;
6. stop when the app reports `PAID` and preserve the payout receipt/signature for final verification.

No mainnet action is authorized.
