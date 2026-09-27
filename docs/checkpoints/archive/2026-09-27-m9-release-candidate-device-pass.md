# M9 Release Candidate — Physical Clean-Install PASS

**UTC date:** 2026-09-27  
**Branch:** `m9-release-submission`  
**Stage:** M9 — release/submission preparation  
**Status:** PASS

## Release candidate provenance

- source commit: `ffcb9b7d69e159ec05fd11139b02bbb442099299`
- Android build run: `36329825769` — PASS
- artifact: `ground-relay-standalone-apk` (`10935757058`)
- APK SHA-256: `cc4074f1dde807f9396e3aaf1a8bdb17d45cbc3bb568fd2ebad2bdfc58e09de4`
- APK size: `114,098,915` bytes
- embedded worker API: `https://ground-relay-agent-gateway-m8.onrender.com/v1`

## Physical verification

A clean Android installation of the exact release candidate was exercised with the worker wallet and the hosted Gateway.

Observed result:

- wallet connected successfully through the mobile flow;
- completed M8 proof task discovered from the hosted inbox;
- exact selected task reconciled against Solana devnet;
- authoritative selected-task state displayed as `PAID`;
- escrow-paid receipt displayed;
- historical state-changing actions remained unavailable;
- safe restart/recovery messaging remained visible and no historical transaction was replayed.

This closes the M9 release-candidate clean-install gate.

## Historical proof identity used for read-only verification

- task ID: `m8-physical-2026-09-27-v1`
- task PDA: `BT5sKaBENnaJx1FPmYTtLC7XEojDnVvXpR455cu1Np5y`
- payout signature: `UbpwAKQMUHmFyBGBF9Z7tq76LmS5oHtT8cyA27SG2ZRoWn7Hn4y57HDR9vPhGWNfw3o5deNEHwCeDYVxQYr2Qge`
- reward: `1,000,000` atomic = `0.001 WSOL`

No new claim, evidence submission, acceptance, payout, or fixture reset was performed during this verification.

## Next

Proceed with reviewer-facing documentation, final demo/video package, screenshots, pitch deck, and submission copy. Do not authorize mainnet deployment from this checkpoint.
