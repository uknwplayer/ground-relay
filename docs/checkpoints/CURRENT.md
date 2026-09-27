# Current checkpoint

**UTC date:** 2026-09-27  
**Stage:** M9 — release/submission preparation  
**Repository:** `uknwplayer/ground-relay`  
**Working branch:** `m8-product-hardening` pending integration into `main`

## Current state

M8 product hardening is complete on the working branch.

Ground Relay has physically proved the hardened loop on a fresh, non-canonical Solana devnet task:

`hosted inbox -> select -> claim -> restart/recovery -> camera evidence -> DELIVERED -> poster ACCEPTED -> generic verified payout -> PAID reconciliation`

The proof also exercised a real post-wallet DNS/RPC failure. The payout had already reached Solana; the app did not replay the transaction, independent chain verification found `PAID`, and the Android UI later reconciled to the terminal paid receipt after network recovery.

M5, M6, M7, and M8 are complete. M7 is already merged into `main`. M8 is fully verified on `m8-product-hardening`; integration into `main` is the next human-controlled branch decision before normal M9 release work proceeds.

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

Detailed records:

- `docs/checkpoints/archive/2026-09-27-m8-physical-paid.md`
- `docs/checkpoints/archive/2026-09-27-m8-complete.md`

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
- exact payout verification `36311952353` — PASS
- final Android reconciliation: `PAID`

The persisted physical-proof Gateway seed is terminalized as `PAID`; a cold start must not re-advertise it as fresh work.

## Recovery regression fixed during M8

During payout, the Android device lost DNS resolution for `api.devnet.solana.com` after the wallet transaction had already reached Solana. The app correctly locked further actions, but the selected-task badge could fall back to stale Gateway `OPEN` state while the authoritative RPC read was unavailable.

Fix:

- selected-task status/worker display only from authoritative Solana state;
- unavailable RPC presents an unreconciled/unknown state instead of stale Gateway state;
- state-changing actions remain fail-closed.

Regression evidence:

- RED run `36312405844`
- GREEN run `36312595528`

## Runtime / cold-start cleanup

M8 closeout removed the historical canonical proof fixture from active runtime paths and deleted the obsolete `src/demo/task.ts`. Historical values remain only where explicitly useful as test vectors or documentation evidence.

The hosted physical-proof seed was terminalized as `PAID` with the verified worker/evidence hash.

Cleanup commit:

`63fcfdc58a3a2aaa4758277eec111e7b0b774cb8`

## Consolidated M8 completion gate

Workflow:

`M8 final quality sweep`

Run:

`36313234829`

Result:

**PASS**

Fresh verification from that single run:

- root mobile tests: `106/106` PASS;
- TypeScript typecheck: PASS;
- Gateway tests: `63/63` PASS;
- deterministic Gateway resume demo: PASS;
- Anchor/Rust workspace tests: PASS;
- repository hygiene audit: PASS;
- hygiene checked `41` tracked active-source files and `128` tracked repository files.

This satisfies the final M8 exit gate.

## Historical fixture policy

The first canonical physical task is historical audit evidence only. Do not reset it, recreate it, or use it as a generic execution fallback.

## Do not repeat

- Do **not** run devnet identity bootstrap again.
- Do **not** regenerate the program keypair.
- Do **not** overwrite deployment GitHub Secrets.
- Do **not** reset/recreate either paid physical proof task.
- Do **not** retry the M8 physical payout; it is already confirmed `PAID`.
- Do **not** treat Gateway/cache state as transaction authorization.
- Do **not** commit keys, seed phrases, wallet secrets, or auth tokens.
- Do **not** make the Agent Gateway a custodial signer.
- Do **not** describe HTTP callback transport as exactly-once.
- Do **not** authorize mainnet deployment from this checkpoint.

## Next recommended action

Choose how to integrate `m8-product-hardening` into `main`. After integration, begin M9:

1. build the final post-M8 release APK;
2. verify fresh-device installation of the release candidate;
3. collect reviewer-facing proof links and verification instructions;
4. finalize demo video, pitch deck, screenshots, and submission copy;
5. optionally add deep-link/QR handoff if it materially improves the submission experience.
