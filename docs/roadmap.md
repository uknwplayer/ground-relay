# Ground Relay roadmap

This roadmap tracks the path from the proven prototype to a repeatable, hackathon-ready product.

## Status legend

- [x] complete and evidenced
- [~] in progress
- [ ] not complete

## M0 — Project foundation

- [x] Public repository, Android/Expo/React Native baseline, Solana devnet target, CI, and standalone APK workflow.

**Exit condition:** reproducible repository and Android build foundation. **Complete.**

## M1 — Mobile human-in-the-loop prototype

- [x] Physical Android wallet connection through Mobile Wallet Adapter.
- [x] Camera evidence capture and on-device SHA-256.
- [x] Devnet claim/delivery receipts and visible task progression.

**Exit condition:** physical wallet -> claim -> camera -> evidence hash -> delivery proof. **Complete.**

## M2 — Anchor escrow program readiness

- [x] `post_task`, `claim_task`, `submit_evidence`, `accept_task`, `release_payment`, and cancellation/recovery paths.
- [x] Transition guard tests and reproducible SBF + IDL build.
- [x] Controlled deployment identity with no private deployment material in git.

Program ID:

`6v2peeoZVj2AXfczVLqyMUTHYt3XQPqAxCktpTwjUZap`

**Exit condition:** tested program, reproducible artifacts, controlled identity. **Complete.**

## M3 — First real devnet deployment

- [x] Anchor program deployed to devnet under the controlled program ID.
- [x] Executability, ownership, upgrade authority, and deployment metadata independently verified.

**Exit condition:** verifiably executable Ground Relay program on devnet. **Complete.**

## M4 — Real escrow fixture on devnet

- [x] Real funded WSOL task/vault fixture created and inspected on-chain.
- [x] Repeatable fixture tooling without committed private keys.

The canonical fixture later completed its lifecycle and is historical `PAID` proof only.

**Exit condition:** real funded on-chain escrow task. **Complete.**

## M5 — Mobile app -> Anchor integration

- [x] Physical Android app reads a task PDA and performs direct Anchor transitions.
- [x] Camera bytes remain off-chain; SHA-256 is submitted through `submit_evidence`.
- [x] MWA ambiguous-return reconciliation uses authoritative Solana state.
- [x] Full physical lifecycle proved: `OPEN -> CLAIMED -> DELIVERED -> ACCEPTED -> PAID`.

Historical physical payout signature:

`4miSuLtKtHANH7Auv52FbQECCyiPc9gQioo5qENWS8izvyeQtHwPgMZad7W9GyGKJ9MzyYyUD8P6pW9qvM92kpEk`

**Exit condition:** physical Android performs direct Anchor transitions. **Complete.**

## M6 — Acceptance, payout, and failure paths

- [x] Successful acceptance and payout.
- [x] Wrong-worker, wrong-poster, premature release, double payout, expired claim, cancel/refund, and post-cancel guards proved on devnet.
- [x] Defense-in-depth mint/underfunding validators retained.

Guard run: `36208008464` — PASS.

**Exit condition:** successful settlement plus critical adversarial/lifecycle paths. **Complete.**

## M7 — Agent Gateway and resume loop

- [x] Durable task API, task ↔ PDA binding, Solana-authoritative synchronization, restart persistence, and create idempotency.
- [x] Stable resume event ID / `Idempotency-Key` and persisted retry/backoff.
- [x] Verified PAID callback semantics with at-least-once delivery until acknowledgement.
- [x] Gateway remains non-custodial and stores no signing secrets.
- [x] Deterministic blocked-agent -> paid task -> resume demo.

M7 merged into `main` at `42231293ed787d367d0db9d4e183daed6e9f979c`.

Post-merge Gateway check: `36249541738` — PASS.

**Exit condition:** agent resumes only after authoritative paid settlement. **Complete.**

## M8 — Product hardening

- [x] Gateway-backed worker-safe inbox with selected-task PDA reconciliation.
- [x] Receipt/history view distinguishing Solana-confirmed, cached-observation, and receipt-only data.
- [x] Versioned restart restoration with no automatic transaction replay.
- [x] Evidence privacy policy and local-photo cleanup.
- [x] Generic selected-task payout derivation and live token-account verification.
- [x] Callback/SSRF hardening with DNS/public-address validation, connection pinning, TLS hostname preservation, and redirect revalidation.
- [x] Exact token-credit checks for funding, payout, and refund.
- [x] Canonical task-PDA constraints.
- [x] Classic SPL/no-freeze policy for new escrows.
- [x] Delivery deadline and claimed-task timeout recovery.
- [x] Terminal empty-vault reclamation with rent returned only to the original poster.
- [x] Current SBF/IDL consistency and hardened devnet deployment under the existing identity.
- [x] Fresh non-canonical physical Android proof on the hardened deployment.
- [x] Real wallet/network recovery exercise with no unsafe replay.
- [x] Regression fix preventing stale Gateway `OPEN` state from being presented as authoritative during RPC failure.
- [x] Historical runtime fixture/demo state retired; hosted physical-proof seed terminalized as `PAID`.
- [x] Final consolidated mobile/Gateway/Anchor/hygiene quality sweep.
- [ ] Deep-link/QR handoff — optional and deferred unless it materially improves submission UX.

### M8 evidence

Core hardening:

- inbox/restart CI `36265032725` — PASS
- evidence privacy CI `36270786483` — PASS
- callback/SSRF Gateway verification `36272343485` — PASS
- exact token credit `36273332817` — PASS
- canonical task PDA `36274047485` — PASS
- mint/token policy `36275212868` — PASS
- claimed timeout recovery `36278762784` — PASS
- terminal vault reclamation `36280520588` — PASS
- generic payout root CI `36282472180` — PASS
- Anchor SBF + IDL `36288500115` — PASS
- IDL client consistency `36289499220` — PASS

Hardened deployment:

- hardened upgrade `36294101421`, attempt 2 — PASS
- independent signer-free preflight `36296153445`, attempt 2 — PASS
- Program ID unchanged: `6v2peeoZVj2AXfczVLqyMUTHYt3XQPqAxCktpTwjUZap`
- ProgramData unchanged: `GKggYJQfNJsZn2EqtuasShdKVPKxWUNbv3zg61UPjJgR`

Fresh physical proof:

- hosted Gateway smoke `36303711875` — PASS
- fresh task creation/binding `36303227689` — PASS
- hosted-Gateway Android APK `36303092998` — PASS
- acceptance `36311385406` — PASS
- authoritative paid-state check `36311843338` — PASS
- exact payout verification `36311952353` — PASS
- payout signature `UbpwAKQMUHmFyBGBF9Z7tq76LmS5oHtT8cyA27SG2ZRoWn7Hn4y57HDR9vPhGWNfw3o5deNEHwCeDYVxQYr2Qge`
- worker token delta `+1,000,000` atomic = `+0.001 WSOL`
- vault final amount `0`
- final Android reconciliation: `PAID`

Network-recovery regression:

- RED `36312405844`
- GREEN `36312595528`

Consolidated closeout:

- M8 final quality sweep `36313234829` — PASS
- root mobile tests `106/106`
- Gateway tests `63/63`
- TypeScript typecheck PASS
- deterministic Gateway demo PASS
- Anchor workspace host tests PASS
- repository hygiene PASS

Detailed completion record: `docs/checkpoints/archive/2026-09-27-m8-complete.md`.

M8 merged through PR #3 into `main` at `ffcb9b7d69e159ec05fd11139b02bbb442099299`.

**Exit condition:** hardened flow repeats on a fresh non-canonical task, survives restart/network ambiguity without unsafe replay, and passes the consolidated closeout sweep. **Complete.**

## M9 — Release and hackathon submission

- [x] Integrate completed M8 work into `main` through reviewed PR #3.
- [x] Produce final installable APK from the post-M8 integrated state.
- [x] Verify physical clean installation of the release candidate and authoritative `PAID` reconciliation.
- [x] Record APK provenance, artifact digest, SHA-256, and reviewer verification instructions.
- [x] Update hardened architecture documentation for reviewers.
- [x] Draft final hackathon submission copy.
- [x] Polish the 90-second demo script and shot sequence.
- [x] Define publication-safe screenshot plan.
- [x] Define judge-facing pitch deck structure.
- [~] Final README reviewer start-here polish.
- [ ] Produce publication-safe screenshots/assets.
- [ ] Produce final pitch deck from the approved outline.
- [ ] Record/edit the 90-second demo video.
- [ ] Optional deep-link/QR handoff if it materially improves the demo.
- [ ] Optional Solana dApp Store readiness work if useful.
- [ ] Run final submission audit and submit only after repository, APK, video, deck, screenshots, and proof links are final.

Release candidate evidence:

- source commit `ffcb9b7d69e159ec05fd11139b02bbb442099299`
- Android build `36329825769` — PASS
- artifact `10935757058`
- APK SHA-256 `cc4074f1dde807f9396e3aaf1a8bdb17d45cbc3bb568fd2ebad2bdfc58e09de4`
- physical clean-install/reconciliation — PASS
- device gate record `docs/checkpoints/archive/2026-09-27-m9-release-candidate-device-pass.md`

**Exit condition:** a reviewer can install or inspect the project, understand it quickly, and independently verify the devnet proof.

## Project definition of done

Ground Relay is complete for this project when reproducible proof establishes:

`agent blocked -> funded on-chain task -> worker claims -> camera evidence -> evidence hash -> verifier accepts -> escrow pays worker -> agent resumes`

The repository must also contain reproducible CI/build instructions, a final APK, public verification references, and the hackathon submission materials.
