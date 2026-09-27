# Current checkpoint

**UTC date:** 2026-09-27  
**Stage:** M8 — product hardening  
**Repository:** `uknwplayer/ground-relay`  
**Working branch:** `m8-product-hardening`

## Current state

Ground Relay has already proven the core product thesis in two connected halves:

1. a physical Android worker completed and settled a funded Anchor task on Solana devnet;
2. the non-custodial Agent Gateway correlated a task to an originating agent and delivered an idempotent resume callback only after authoritative PAID settlement.

Target loop:

`agent blocked -> funded task -> worker claims -> camera evidence -> verifier accepts -> escrow pays worker -> verified agent resume callback`

M5, M6, and M7 are complete. M7 is merged into `main`. M8 is active and now includes the multi-task inbox/restart flow, history, evidence privacy, callback/SSRF hardening, Anchor payment/account hardening, generic selected-task payout verification, claimed-task timeout recovery, terminal vault rent reclamation, current SBF/IDL consistency, and the hardened Anchor deployment on devnet.

M8 is **not complete yet** because the generic flow still needs a fresh physical non-canonical end-to-end proof on the hardened deployment, followed by the final recovery/security/demo sweep.

## Canonical devnet identity

Program ID:

`6v2peeoZVj2AXfczVLqyMUTHYt3XQPqAxCktpTwjUZap`

Controlled upgrade/deployer/poster:

`6WG3UpKV9vBRh4XR961eZGpPZcHVGdxqpM3Eten5quuZ`

Canonical ProgramData:

`GKggYJQfNJsZn2EqtuasShdKVPKxWUNbv3zg61UPjJgR`

Do not regenerate the program identity or replace deployment Secrets.

## Canonical historical physical payout proof

- task ID: `e335a4ea1f23a002db02f94c371d311b5b46fa908a7f2f6c9f72e60ea122f662`
- task PDA: `7knPNeaZHDn7qVzdGy6Qbq3tWnHMnP2TpHULwLKzVtpT`
- vault PDA: `FGaGmGu8cbYRbdsUubmLDDRNnjic5NutnCM4kFL77bZm`
- poster: `6WG3UpKV9vBRh4XR961eZGpPZcHVGdxqpM3Eten5quuZ`
- worker: `7XY6t1adc9vmuefiEP25TsoEjxRkFhVxT4yQrtN5zr2C`
- worker WSOL account: `2fm8p8DpCeJvcpvNbCpzURRezQthF2z2yQARLgPgZfu6`
- mint: `So11111111111111111111111111111111111111112`
- reward: `1,000,000` atomic = `0.001 WSOL`
- evidence SHA-256: `7d29069a59aec691ef133d7b7813cdd6e0d4a2ffc807e0887f9a5ad5a59ba802`
- acceptance signature: `4QVs7r2xBgSNzZHm8z3N5jbJZKVNCAT4cXEw9pTCqVRv79DchyYDfjnUXUsDJCVWuWFZCZ6WJYE1zTBrDoHSF8Hd`
- payout signature: `4miSuLtKtHANH7Auv52FbQECCyiPc9gQioo5qENWS8izvyeQtHwPgMZad7W9GyGKJ9MzyYyUD8P6pW9qvM92kpEk`
- independent post-payout inspection: run `36207197941`
- final state: `PAID`
- final vault amount: `0`
- final worker token amount: `1,000,000`

Detailed record: `docs/checkpoints/archive/2026-09-26-mobile-anchor-paid.md`.

This fixture is historical proof only. Do not reset it or present it as a fresh OPEN task.

## M6 lifecycle proof

Run `36208008464` proved wrong-worker/wrong-poster rejection, release-before-acceptance rejection, second-payout rejection with unchanged balances, expired-claim rejection, exact open-task cancellation/refund, second-cancel rejection, and claim-after-cancel rejection.

Detailed record: `docs/checkpoints/archive/2026-09-26-m6-devnet-guards.md`.

## M7 Agent Gateway proof

M7 provides durable persistence, task <-> PDA binding, authoritative Solana sync, create idempotency, stable resume event identity, verified PAID settlement notification, HTTP resume delivery, persisted retry/backoff, restart recovery, manual retry, and a deterministic agent-resume demo.

Merged M7 main commit:

`42231293ed787d367d0db9d4e183daed6e9f979c`

Post-merge Gateway check:

`36249541738` — PASS

Resume semantics remain:

**one logical event, at-least-once HTTP transport until acknowledgement**.

Detailed record: `docs/checkpoints/archive/2026-09-26-m7-agent-resume.md`.

## M8 implemented hardening

### Mobile product flow

- Gateway worker-safe inbox and typed client;
- selected-task PDA reconciliation against Solana;
- versioned restart state with no automatic transaction replay;
- dedicated receipt/history model and screen;
- read-only fail-closed behavior when authoritative network state is unavailable;
- MWA false-negative reconciliation against chain state;
- app no longer uses the canonical historical fixture as generic execution state.

### Evidence privacy

- raw photo remains local;
- URI/Base64/bytes are not persisted in AsyncStorage;
- cleanup occurs after confirmed/reconciled delivery, task abandon/change, or successful retake replacement;
- ambiguous wallet errors reconcile before any deletion;
- metadata stripping is not falsely claimed.

Policy: `docs/security/evidence-privacy.md`.

### Gateway callback / SSRF

- callback URLs reject credentials and unsafe/private/local/reserved targets;
- DNS is resolved before connection and unsafe answers fail closed;
- connection is pinned to the validated IP while preserving TLS hostname/SNI;
- redirects are manually bounded and revalidated;
- callback event identity / `Idempotency-Key` remains stable across retries.

Fresh Gateway verification after docs: `36272343485` — PASS.

### Anchor security/payment hardening

Current branch includes:

- exact credited-token checks for initial funding, worker payout, and poster refund;
- canonical task-PDA validation on state transitions;
- new escrows restricted to classic SPL Token with `freeze_authority = None`;
- `expires_at` enforced as the delivery deadline;
- poster recovery of abandoned `Claimed` escrow only after expiry;
- terminal vault closure only for zero-balance `Paid`/`Cancelled` tasks;
- terminal vault rent always returns to the original poster;
- task PDA intentionally remains alive as the authoritative receipt.

Key Anchor verification runs:

- exact token credit: `36273332817` — PASS
- canonical task PDA: `36274047485` — PASS
- mint/token policy: `36275212868` — PASS
- claimed timeout recovery: `36278762784` — PASS
- terminal vault reclamation: `36280520588` — PASS

### Generic selected-task payout

Generic payout is no longer blanket fail-closed.

The app now derives the canonical vault from `['vault', taskPda]`, derives the worker classic-SPL ATA, reads both accounts from Solana, and enables `release_payment` only after validating owner program, mint, authority, and vault funding. No canonical-fixture fallback is used.

Verification:

- GREEN commit: `f01ae707af39854b44b33e6c63848815aa219635`
- root CI: `36282472180` — PASS
- Android standalone APK: `36282472199` — PASS

If the worker ATA does not exist, payout remains blocked; the app does not silently create it or spend worker rent.

## Current SBF + IDL proof

The M8 branch runs Anchor SBF/IDL and IDL-client workflows directly on `m8-*` pushes.

- Anchor workflow trigger commit: `cda4603b27f35d435ea5829bb0db0823aac80581`
- IDL-client workflow trigger commit: `dec6cfa7d0d7630bc32d7db380a6e5f6822846f9`
- `Anchor SBF + IDL` run: `36288500115` — PASS
- build artifact: `10921571305`
- generated SBF: `ground_relay.so`, 254,144 bytes
- generated IDL: `ground_relay.json`, 15,712 bytes
- generated IDL program address: `6v2peeoZVj2AXfczVLqyMUTHYt3XQPqAxCktpTwjUZap`
- committed IDL synchronized from the generated artifact: `24702a7430ff78ca86a2a3d9bf90199ef11d81a1`
- `IDL client consistency` run after synchronization: `36289499220` — PASS

This proves the branch artifacts and client-facing IDL are consistent. The same hardened SBF was subsequently upgraded onto the controlled devnet program identity and independently inspected on-chain, as recorded below.

## Hardened devnet deployment proof

The controlled M8 Anchor upgrade is complete on Solana devnet. No program identity, ProgramData address, deployment Secrets, or mainnet state were changed.

Upgrade evidence:

- original hardened upgrade workflow: run `36294101421`, attempt 2 — PASS
- original hardened upgrade branch commit: `2769fb6cbc13800a653a579e77ef630c2832f52d`
- original upgrade transaction signature: `5wDA7i8kM1jwwS6NAMhwRvFzfKmxAA7z2xpjKiLLZTiLi86pGTXgFAuiuZRZWcywxZuqbowBPChDkUGJxfVVFoKA`
- latest controlled same-SBF deploy confirmation: run `36296759500` — PASS at branch commit `b58718faa6cd46b552e5b83e6c9346edd669a1e9`
- Program ID after upgrade/redeploy: `6v2peeoZVj2AXfczVLqyMUTHYt3XQPqAxCktpTwjUZap`
- program data auto-extension during the first hardened upgrade: `230,680 -> 254,144` bytes
- metadata account remained: `7GuXcvE5MrKneC5vSAcyZZHmQ8k1Pm7NhNHTGDTBmqWp`
- deploy workflow post-check: account present, BPFUpgradeableLoader-owned, executable — PASS
- key-material cleanup step — PASS

Independent signer-free post-upgrade verification was strengthened in commit `b4d8fd4238865d66922fd24c96ea1a80543b2247`, and enabled on `m8-*` in commit `58857d083cb20111e48ee720b22fa7d626c0507c`.

Fresh independent preflight after the latest controlled deploy:

- run `36296153445`, attempt 2 — PASS
- Program ID: `6v2peeoZVj2AXfczVLqyMUTHYt3XQPqAxCktpTwjUZap`
- owner: `BPFLoaderUpgradeab1e11111111111111111111111`
- executable: `True`
- canonical ProgramData: `GKggYJQfNJsZn2EqtuasShdKVPKxWUNbv3zg61UPjJgR`
- ProgramData data length: `254,189` bytes (`45` loader metadata + `254,144` SBF)
- last deployed slot: `504672943`
- upgrade authority: `6WG3UpKV9vBRh4XR961eZGpPZcHVGdxqpM3Eten5quuZ`
- confirmed RPC context slot at inspection: `504690023`

Detailed fresh verification record: `docs/checkpoints/archive/2026-09-27-m8-post-redeploy-verification.md`.

This independently establishes that the hardened M8 SBF is live on devnet under the original controlled identity and authority after the latest deploy. It does not imply or authorize any mainnet deployment.

## Remaining M8 work

1. Create/use a fresh non-canonical devnet task and run the physical Android flow on the hardened deployment: inbox -> select -> claim -> restart/recovery -> evidence -> accept -> verified payout -> paid reconciliation.
2. Exercise final wallet/network recovery cases on the physical device.
3. Perform a repository-wide demo-only/legacy wording/value sweep and a final consolidated security review.
4. Close M8 documentation/checkpoints after the physical proof.

Deep-link/QR handoff is optional and is not currently an M8 blocker; it can move to M9 unless it materially improves the final demo.

## Key documents

- `docs/product-anatomy.md`
- `docs/roadmap.md`
- `docs/architecture.md`
- `docs/escrow-protocol.md`
- `docs/openapi.yaml`
- `docs/security/evidence-privacy.md`
- `docs/superpowers/specs/2026-09-26-m8-mobile-inbox-restart-design.md`
- `docs/superpowers/plans/2026-09-26-m8-mobile-inbox-restart.md`
- `docs/checkpoints/archive/2026-09-26-mobile-anchor-paid.md`
- `docs/checkpoints/archive/2026-09-26-m6-devnet-guards.md`
- `docs/checkpoints/archive/2026-09-26-m7-agent-resume.md`
- `docs/checkpoints/archive/2026-09-26-m8-inbox-restart.md`
- `docs/checkpoints/archive/2026-09-27-m8-post-redeploy-verification.md`

## Do not repeat

- Do **not** run devnet identity bootstrap again.
- Do **not** regenerate the program keypair.
- Do **not** overwrite deployment GitHub Secrets.
- Do **not** reset/recreate the canonical paid fixture.
- Do **not** use old memo receipts as the primary Anchor proof.
- Do **not** commit keys, seed phrases, wallet secrets, or auth tokens.
- Do **not** make the Agent Gateway a custodial signer.
- Do **not** describe HTTP callback delivery as exactly-once transport.
- Do **not** authorize mainnet deployment from this checkpoint.
- Do **not** treat a future branch build alone as deployment proof; require an upgrade transaction plus an independent signer-free on-chain verification as done here.

## Next recommended action

Run the fresh non-canonical physical M8 end-to-end proof on the hardened devnet deployment. It must cover task discovery/selection, claim, restart/recovery, evidence submission, acceptance, generic verified payout, and final PAID reconciliation before M8 is declared complete.
