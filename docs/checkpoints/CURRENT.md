# Current checkpoint

**UTC date:** 2026-09-27  
**Stage:** M8 — product hardening closeout  
**Repository:** `uknwplayer/ground-relay`  
**Working branch:** `m8-product-hardening`

## Current state

Ground Relay has now proved the hardened product loop on a fresh, non-canonical Solana devnet task:

`hosted inbox -> select -> claim -> restart/recovery -> camera evidence -> DELIVERED -> poster ACCEPTED -> generic verified payout -> PAID reconciliation`

The physical proof is complete. The device also encountered a real DNS/RPC failure immediately after a successful payout transaction. The app remained fail-closed, the transaction was not replayed, independent chain verification found the task already `PAID`, and the Android UI later reconciled to `PAID` after network restoration.

M5, M6, and M7 are complete. M7 is merged into `main`. M8 implementation and physical evidence are complete; the branch is at the final consolidated quality/hygiene gate before M8 is formally closed and work moves to M9 release/submission.

## Controlled devnet identity

Program ID:

`6v2peeoZVj2AXfczVLqyMUTHYt3XQPqAxCktpTwjUZap`

Controlled upgrade/deployer/poster:

`6WG3UpKV9vBRh4XR961eZGpPZcHVGdxqpM3Eten5quuZ`

Canonical ProgramData:

`GKggYJQfNJsZn2EqtuasShdKVPKxWUNbv3zg61UPjJgR`

Do not regenerate the program identity or replace deployment Secrets.

## Hardened deployment evidence

- Anchor SBF + IDL run `36288500115` — PASS
- IDL client consistency `36289499220` — PASS
- hardened upgrade run `36294101421`, attempt 2 — PASS
- upgrade signature `5wDA7i8kM1jwwS6NAMhwRvFzfKmxAA7z2xpjKiLLZTiLi86pGTXgFAuiuZRZWcywxZuqbowBPChDkUGJxfVVFoKA`
- independent post-deploy preflight `36296153445`, attempt 2 — PASS
- independently observed last deployed slot `504672943`
- Program ID and ProgramData identity remained unchanged

No mainnet deployment is authorized or implied by this checkpoint.

## Fresh M8 physical proof

Gateway task ID:

`m8-physical-2026-09-27-v1`

Task ID hex:

`43708dffc89099253d8ac7dce7ac1b70fcc0bdd6b7498051bcbae2dc908a77b8`

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

Acceptance signature:

`2e9xNS5DxU1a6i6cXYpWMHvWqsyGHkvLZtpUM74wmQQJh581BzJSd6fLcgm2yL7accFb3uap8mjbCSE8AfPpRC1C`

Payout signature:

`UbpwAKQMUHmFyBGBF9Z7tq76LmS5oHtT8cyA27SG2ZRoWn7Hn4y57HDR9vPhGWNfw3o5deNEHwCeDYVxQYr2Qge`

Payout slot:

`504746194`

Exact payout verification:

- worker WSOL before: `1,000,000`
- worker WSOL after: `2,000,000`
- worker delta: `+1,000,000`
- vault before: `1,000,000`
- vault after: `0`
- authoritative task state: `PAID`

Verification run `36311952353` — PASS.

Detailed record: `docs/checkpoints/archive/2026-09-27-m8-physical-paid.md`.

## Hosted Gateway / Android evidence

Hosted Gateway:

`https://ground-relay-agent-gateway-m8.onrender.com`

Worker API:

`https://ground-relay-agent-gateway-m8.onrender.com/v1`

Evidence:

- listener RED/GREEN: `36302895258` / `36302967162`
- hosted smoke `36303711875` — PASS
- fresh task create/bind `36303227689` — PASS
- hosted-Gateway Android APK `36303092998` — PASS
- poster acceptance `36311385406` — PASS
- post-device-failure paid-state verification `36311843338` — PASS

The persisted physical-proof Gateway seed is terminalized as `PAID`; it must not be re-advertised as fresh work after a cold start.

## Recovery bug found during the physical proof

During payout, the Android device lost DNS resolution for `api.devnet.solana.com` after the wallet transaction had already reached Solana. The app correctly locked further actions, but the selected-task badge could fall back to stale Gateway `OPEN` state while the authoritative RPC read was unavailable.

Root cause:

`displayStatus` / `displayWorker` fell back to the inbox projection after `authoritative` was cleared at refresh start.

Fix:

- selected-task status/worker now display only from authoritative Solana state;
- RPC failure presents unknown/unreconciled state rather than stale Gateway state;
- actions remain fail-closed.

Regression evidence:

- RED run `36312405844`
- GREEN run `36312595528`

## M8 hardening already implemented

### Mobile

- worker-safe Gateway inbox;
- exact selected-task PDA reconciliation;
- versioned restart context with no automatic transaction replay;
- receipt/history model;
- MWA false-negative reconciliation;
- generic payout context derivation and live account validation;
- fail-closed wallet/network behavior;
- raw evidence bytes kept out of persistent state.

### Gateway

- durable task persistence and idempotent create;
- task ↔ PDA binding;
- authoritative Solana sync;
- stable resume event identity;
- persisted retry/backoff and restart recovery;
- SSRF hardening with DNS validation, public-target enforcement, connection pinning, TLS hostname preservation, and bounded/revalidated redirects;
- at-least-once delivery semantics until acknowledgement.

### Anchor

- exact credit checks;
- canonical task-PDA constraints;
- classic SPL/no-freeze policy for new escrows;
- delivery deadline enforcement;
- claimed timeout recovery;
- terminal zero-balance vault closure to original poster rent destination;
- durable task PDA receipt.

## Historical fixture policy

The first canonical physical task remains historical evidence only. It must not be reset or used as a generic execution fallback.

The old runtime `demoTask` and historical fixture constants have been retired from active mobile source during M8 closeout. Historical addresses/signatures may remain in tests and documentation where they are explicitly used as proof vectors.

## Current closeout gate

A consolidated final sweep now verifies in one run:

1. mobile Node tests;
2. TypeScript typecheck;
3. Gateway tests;
4. deterministic Gateway demo;
5. Anchor host tests;
6. repository hygiene for stale fixture/runtime values, stale M8 wording, suspicious tracked secret filenames, and active-source TODO/FIXME markers.

The first sweep run `36312688805` intentionally failed only at the hygiene stage and identified the remaining cleanup targets; all mobile, Gateway, demo, and Anchor test stages passed. The runtime/docs cleanup is being applied, then the sweep must be rerun green before M8 is declared complete.

## Do not repeat

- Do **not** run devnet identity bootstrap again.
- Do **not** regenerate the program keypair.
- Do **not** overwrite deployment GitHub Secrets.
- Do **not** reset/recreate the historical paid fixture.
- Do **not** retry the M8 physical payout; it is already confirmed `PAID`.
- Do **not** treat Gateway/cache state as transaction authorization.
- Do **not** commit keys, seed phrases, wallet secrets, or auth tokens.
- Do **not** make the Agent Gateway a custodial signer.
- Do **not** describe HTTP callback transport as exactly-once.
- Do **not** authorize mainnet deployment from this checkpoint.

## Next recommended action

Finish the consolidated M8 quality/hygiene sweep. If it passes, archive an M8-complete checkpoint and advance the roadmap to M9 release/submission work: final release APK, fresh-device install, reviewer proof links, demo video, pitch deck, screenshots, and submission copy.
