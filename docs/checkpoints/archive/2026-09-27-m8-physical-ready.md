# M8 Physical Proof — Ready for Device Execution

**UTC date:** 2026-09-27  
**Branch:** `m8-product-hardening`  
**Stage:** M8 — product hardening  
**Status:** infrastructure and fresh non-canonical task ready; physical Android execution pending

## Purpose

This checkpoint records the handoff immediately before the fresh physical M8 proof. The historical canonical M5 payout fixture remains untouched. A new funded task now exists on the hardened Ground Relay devnet program and is discoverable through the hosted worker Gateway.

The remaining physical proof is:

`hosted inbox -> select fresh task -> claim -> app restart/recovery -> camera evidence -> submit -> poster acceptance -> generic verified payout -> PAID reconciliation`

## Hardened program identity

Program ID:

`6v2peeoZVj2AXfczVLqyMUTHYt3XQPqAxCktpTwjUZap`

Controlled poster/deployer:

`6WG3UpKV9vBRh4XR961eZGpPZcHVGdxqpM3Eten5quuZ`

No program identity, deployment secret, or mainnet state was changed while preparing this proof.

## Hosted Agent Gateway

Public base URL:

`https://ground-relay-agent-gateway-m8.onrender.com`

Worker API base used by the Android build:

`https://ground-relay-agent-gateway-m8.onrender.com/v1`

The hosted process binds to `0.0.0.0` while preserving an explicit `HOST` override for local/testing use.

Gateway listener regression proof:

- initial RED run: `36302895258` — expected failure before `gateway/listen.mjs` existed;
- GREEN run: `36302967162` — Gateway test suite and deterministic demo PASS.

The hosted state is seeded from `gateway/data/state.json`, rather than relying only on Render's ephemeral `/tmp` filesystem. Solana remains authoritative; the seed exists only to preserve discovery metadata after a service cold start/redeploy.

Hosted smoke verification:

- workflow: `Hosted M8 Gateway smoke`
- run: `36303711875` — PASS
- health endpoint: PASS
- worker inbox: fresh task present
- task status at smoke time: `open`
- task PDA: exact expected match
- `callbackUrl` leak check: PASS

## Fresh non-canonical physical task

Fixture name:

`ground-relay-m8-physical-2026-09-27-v1`

Gateway task ID:

`m8-physical-2026-09-27-v1`

Task ID hex:

`43708dffc89099253d8ac7dce7ac1b70fcc0bdd6b7498051bcbae2dc908a77b8`

Task PDA:

`BT5sKaBENnaJx1FPmYTtLC7XEojDnVvXpR455cu1Np5y`

Vault PDA:

`F8vdvACWiaFCmh95HLEJGKVbZsXZ9Wvs5cd33qzbZysV`

Reward mint:

`So11111111111111111111111111111111111111112` (devnet WSOL)

Reward:

`1,000,000` atomic units = `0.001 WSOL`

Poster WSOL account:

`FBeCmjTbAYKP9ZmEr35Fum7sVrsm8EgipVQup2KFgnec`

Expiry:

`1793086407`

Initial/fresh state:

`OPEN`

Initial vault amount:

`1,000,000`

`post_task` signature:

`5aVsJ4LZ8aLAHq8z7aFPhGFPuHyji5XHXSPUwTyWcDHRAAej9R81JGzw3hsidwHenesaTC5GypKP1hoB5DJfCSX2`

Creation/binding verification:

- workflow: `M8 physical devnet fixture`
- run: `36303227689` — PASS
- fresh Anchor task: PASS
- funded vault identity/authority/amount checks: PASS
- Gateway task creation: PASS
- authoritative chain binding: PASS
- hosted inbox lookup and exact PDA check: PASS
- temporary poster key material cleanup: PASS

This task is deliberately separate from the historical canonical paid fixture.

## Android build configuration

The M8 standalone APK workflow now injects:

`EXPO_PUBLIC_GROUND_RELAY_GATEWAY_URL=https://ground-relay-agent-gateway-m8.onrender.com/v1`

This allows the physical app to load the hosted worker inbox instead of relying on a local Gateway.

The APK build started as GitHub Actions run `36303092998` from commit `621e3819eb69a1641ab77ed735150823c6d6c95d`. At the moment this checkpoint was written, the release Gradle step was still running; do not treat the APK as ready until that run finishes successfully and its artifact is downloaded/verified.

## Poster acceptance path prepared

A dedicated idempotent acceptance helper exists for this fresh task:

- `scripts/devnet-fixture/accept-m8-physical.cjs`
- `.github/workflows/m8-accept-physical.yml`

It derives the task PDA from the fixed M8 fixture identity, verifies the controlled poster, requires the task to be `DELIVERED` before a new acceptance transaction, tolerates an already `ACCEPTED`/`PAID` state, and synchronizes the hosted Gateway after acceptance.

It must **not** be triggered before the physical device has successfully submitted evidence and authoritative Solana state is `DELIVERED`.

## Physical execution sequence

1. Install the hosted-Gateway M8 APK whose build run is recorded above only after that run passes.
2. Connect the worker wallet. Prefer the same Solflare worker wallet used for the prior physical proof because its classic-SPL WSOL ATA is already known to exist; generic payout remains fail-closed when the worker ATA does not exist.
3. Refresh the inbox and select `M8 physical proof — capture a current scene`.
4. Confirm the task reconciles from Solana as `OPEN` and the PDA is the fresh task PDA above.
5. Claim the task from the Android app and confirm it becomes `CLAIMED` authoritatively.
6. Force-close the app after the claim.
7. Reopen it and verify the same selected task/session restores without replaying the transaction; fresh chain reconciliation must still show `CLAIMED`.
8. Capture one current photo through the in-app camera flow.
9. Submit the evidence and confirm authoritative state becomes `DELIVERED`.
10. Stop before payout and run the prepared poster acceptance workflow.
11. Refresh/reconcile on Android and confirm `ACCEPTED`.
12. Let the app derive and verify the generic payout context. Only proceed when the worker token account, mint, vault authority, vault mint, and funding checks pass.
13. Release payment from the worker app/wallet.
14. Reconcile final state as `PAID`, with zero task-vault token balance and the exact worker payout credited.
15. Restart once more and verify the terminal receipt/history restores without replaying any transaction.

## Safety / non-regression rules

- Do not reset or mutate the historical canonical paid fixture.
- Do not regenerate the program keypair or run identity bootstrap.
- Do not overwrite deployment Secrets.
- Do not use historical fixture addresses as fallbacks for this fresh task.
- Do not accept before authoritative `DELIVERED`.
- Do not bypass generic payout account validation.
- Do not authorize or deploy mainnet from this checkpoint.
- Raw evidence photo contents remain local; only the evidence hash belongs in protocol state.

## Next action

Finish and verify Android run `36303092998`, download the resulting standalone APK, then begin the physical sequence above. The next unavoidable human interaction is installation/operation of the Android app and wallet approval on the physical device.
