# Ground Relay roadmap

This roadmap tracks the path from the proven prototype to a repeatable, hackathon-ready product.

## Status legend

- [x] complete and evidenced
- [~] in progress
- [ ] not complete

## M0 — Project foundation

- [x] Public repository, Android/Expo/React Native baseline, Solana devnet development target, CI, and standalone APK workflow.

**Exit condition:** reproducible repository and Android build foundation. **Complete.**

## M1 — Mobile human-in-the-loop prototype

- [x] Physical Android Solflare connection through Mobile Wallet Adapter.
- [x] Camera evidence capture and on-device SHA-256.
- [x] Devnet claim/delivery receipts and visible task progression.

**Exit condition:** physical-device wallet -> claim -> camera -> evidence hash -> delivery proof. **Complete.**

## M2 — Anchor escrow program readiness

- [x] `post_task`, `claim_task`, `submit_evidence`, `accept_task`, `release_payment`, and `cancel_open_task`.
- [x] Transition guard tests and reproducible SBF + IDL build.
- [x] Controlled deployment identity, no private deployment material in git.

Controlled program ID:

`6v2peeoZVj2AXfczVLqyMUTHYt3XQPqAxCktpTwjUZap`

**Exit condition:** tested program, reproducible artifacts, controlled identity. **Complete.**

## M3 — First real devnet deployment

- [x] Anchor program deployed to devnet at the controlled program ID.
- [x] Executability, upgrade authority, ownership, and deployment metadata verified.

**Exit condition:** verifiably executable Ground Relay program on devnet. **Complete.**

## M4 — Real escrow fixture on devnet

- [x] Real funded WSOL task/vault fixture created and inspected on-chain.
- [x] Repeatable fixture tooling without committed private keys.

The canonical fixture later completed the lifecycle and is now historical `PAID` proof. It must not be reset or presented as a fresh OPEN task.

**Exit condition:** real funded on-chain escrow task. **Complete.**

## M5 — Mobile app -> Anchor integration

- [x] Physical Android app reads the real task PDA and performs direct Anchor transitions.
- [x] Camera bytes remain off-chain; SHA-256 is submitted through `submit_evidence`.
- [x] MWA ambiguous-return reconciliation uses authoritative Solana state.
- [x] Full physical lifecycle proved: `OPEN -> CLAIMED -> DELIVERED -> ACCEPTED -> PAID`.

Physical payout:

`4miSuLtKtHANH7Auv52FbQECCyiPc9gQioo5qENWS8izvyeQtHwPgMZad7W9GyGKJ9MzyYyUD8P6pW9qvM92kpEk`

Independent post-payout inspection: run `36207197941`.

**Exit condition:** physical Android performs direct Anchor transitions. **Complete.**

## M6 — Acceptance, payout, and failure paths

- [x] Successful acceptance and payout.
- [x] Wrong-worker, wrong-poster, premature release, double payout, expired claim, cancel/refund, and post-cancel guards proved on devnet.
- [x] Defense-in-depth mint/underfunding validators retained.

Guard run: `36208008464`.

Detailed record: `docs/checkpoints/archive/2026-09-26-m6-devnet-guards.md`.

**Exit condition:** successful settlement plus critical adversarial/lifecycle paths. **Complete.**

## M7 — Agent Gateway and resume loop

- [x] Durable task API, task <-> PDA binding, Solana-authoritative synchronization, restart persistence, and create idempotency.
- [x] Stable resume event ID / `Idempotency-Key` and persisted retry/backoff.
- [x] Verified PAID callback semantics with at-least-once delivery until acknowledgement.
- [x] Gateway remains non-custodial and stores no signing secrets.
- [x] Deterministic blocked-agent -> paid task -> resume demo.

M7 is merged into `main` at `42231293ed787d367d0db9d4e183daed6e9f979c`.

Post-merge Gateway check: `36249541738` — PASS.

Detailed record: `docs/checkpoints/archive/2026-09-26-m7-agent-resume.md`.

**Exit condition:** agent resumes only after authoritative paid settlement. **Complete.**

## M8 — Product hardening

- [x] Gateway-backed worker-safe task inbox with selected-task PDA reconciliation.
- [x] Dedicated selected-task receipt/history view distinguishing Solana-confirmed, cached-observation, and receipt-only data.
- [~] Wallet/network recovery states — MWA ambiguity, Gateway outage, and Solana outage handling are implemented; final fresh-device exercise remains.
- [x] Versioned restart/state restoration with no automatic transaction replay.
- [ ] Deep-link/QR handoff — optional and deferred unless it materially improves the M8/M9 demo.
- [x] Evidence privacy policy and local-photo retention cleanup.
- [~] Security review — callback/SSRF, exact token credit, canonical task PDA enforcement, classic-SPL/no-freeze policy for new escrows, selected-task payout verification, claimed-task timeout recovery, terminal vault closure, and deployed-program parity are implemented and evidenced. Final consolidated review remains.
- [x] Terminal rent policy — zero-balance terminal vaults may be closed and their rent returned only to the original poster; the task PDA is intentionally retained as the authoritative receipt.
- [x] Generic selected-task payout derivation/verification — canonical vault and worker ATA are derived and verified on-chain before payout is enabled; no historical-fixture fallback.
- [x] CI coverage includes mobile Node/typecheck, Android build, Gateway checks, Anchor tests, Anchor SBF + IDL build, and IDL-client consistency.
- [~] Demo-only/legacy cleanup — primary mobile flow no longer depends on `demoTask`, memo receipts, or hardcoded payout context; repository-wide wording/value sweep remains.
- [x] Current hardened Anchor SBF upgraded onto the existing devnet program identity and independently verified on-chain.
- [ ] Run the full physical Android flow against a new non-canonical devnet task on the hardened deployment, including restart/recovery and verified payout.

### M8 evidence

Inbox/restart:
- root CI `36265032725` — 83/83 tests PASS, typecheck PASS
- Android `36265450015` — release build PASS, artifact-upload step PASS
- checkpoint: `docs/checkpoints/archive/2026-09-26-m8-inbox-restart.md`

Receipt/history:
- root CI `36269010656` — PASS

Evidence privacy:
- root CI `36270786483` — 95/95 tests PASS, typecheck PASS
- Android `36270786479` — PASS
- policy: `docs/security/evidence-privacy.md`

Callback/SSRF:
- Gateway verification `36272154186` — PASS
- fresh Gateway verification after docs `36272343485` — PASS

Anchor hardening:
- exact token-credit run `36273332817` — PASS
- canonical task-PDA run `36274047485` — PASS
- mint/token-program policy run `36275212868` — PASS
- claimed-task timeout recovery run `36278762784` — PASS
- terminal-vault rent reclamation run `36280520588` — PASS

Generic selected-task payout:
- GREEN commit `f01ae707af39854b44b33e6c63848815aa219635`
- root CI `36282472180` — PASS
- Android standalone APK `36282472199` — PASS

Current SBF + IDL proof:
- workflow trigger commit `cda4603b27f35d435ea5829bb0db0823aac80581`
- `Anchor SBF + IDL` run `36288500115` — PASS
- artifact `10921571305` contains `ground_relay.so` (254,144 bytes) and generated `ground_relay.json` (15,712 bytes)
- generated IDL address remains `6v2peeoZVj2AXfczVLqyMUTHYt3XQPqAxCktpTwjUZap`
- committed IDL synchronized from that generated artifact in commit `24702a7430ff78ca86a2a3d9bf90199ef11d81a1`
- `IDL client consistency` run `36289499220` — PASS

Hardened devnet deployment:
- original controlled hardened upgrade run `36294101421`, attempt 2 — PASS
- original upgrade signature `5wDA7i8kM1jwwS6NAMhwRvFzfKmxAA7z2xpjKiLLZTiLi86pGTXgFAuiuZRZWcywxZuqbowBPChDkUGJxfVVFoKA`
- latest controlled same-SBF deploy confirmation run `36296759500` — PASS at branch commit `b58718faa6cd46b552e5b83e6c9346edd669a1e9`
- Program ID remained `6v2peeoZVj2AXfczVLqyMUTHYt3XQPqAxCktpTwjUZap`
- SBF program data extended from 230,680 to 254,144 bytes during the first hardened upgrade
- canonical ProgramData remained `GKggYJQfNJsZn2EqtuasShdKVPKxWUNbv3zg61UPjJgR`
- fresh independent signer-free preflight run `36296153445`, attempt 2 — PASS
- independently observed last deployed slot `504672943`
- confirmed RPC context slot `504690023`
- upgrade authority remained `6WG3UpKV9vBRh4XR961eZGpPZcHVGdxqpM3Eten5quuZ`
- fresh verification checkpoint: `docs/checkpoints/archive/2026-09-27-m8-post-redeploy-verification.md`

The current hardened SBF is therefore live on Solana devnet under the existing controlled identity. No mainnet deployment is authorized or implied.

**Remaining M8 blockers:** fresh non-canonical physical-device end-to-end proof, final wallet/network recovery exercise, consolidated security/demo-only sweep, and documentation closeout. Deep-link/QR is not currently considered an M8 blocker.

**Exit condition:** the hardened flow can be repeated on a fresh non-canonical task without manual repair. **Not yet complete.**

## M9 — Release and hackathon submission

- [ ] Produce final installable APK.
- [ ] Verify fresh-device installation.
- [ ] Run one final end-to-end devnet proof and record all relevant signatures/addresses.
- [ ] Final README and architecture documentation.
- [ ] 90-second demo video.
- [ ] Pitch deck.
- [ ] Submission copy and screenshots.
- [ ] Optional Solana dApp Store readiness work if useful.
- [ ] Submit only after repository, APK, video, deck, and proof links are final.

**Exit condition:** a reviewer can install or inspect the project, understand it quickly, and independently verify the devnet proof.

## Project definition of done

Ground Relay is complete for this project when reproducible proof establishes:

`agent blocked -> funded on-chain task -> worker claims -> camera evidence -> evidence hash -> verifier accepts -> escrow pays worker -> agent resumes`

The repository must also contain reproducible CI/build instructions, a final APK, public verification references, and the hackathon submission materials.
