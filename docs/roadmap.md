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
- [x] Callback/SSRF hardening: DNS resolution, public-address checks, IP pinning, TLS hostname preservation, bounded/revalidated redirects.
- [x] Exact token-credit checks for funding, payout, and refund.
- [x] Canonical task-PDA constraints.
- [x] Classic SPL/no-freeze policy for new escrows.
- [x] Delivery deadline and claimed-task timeout recovery.
- [x] Terminal empty-vault reclamation with rent returned only to the original poster.
- [x] Current SBF/IDL consistency and hardened devnet deployment under the existing identity.
- [x] Fresh non-canonical physical Android proof on the hardened deployment.
- [x] Real wallet/network recovery exercise: payout reached Solana while the phone lost DNS access to the RPC; no transaction was replayed and final `PAID` reconciliation recovered after network restoration.
- [x] Regression fix preventing stale Gateway `OPEN` state from being presented as authoritative during RPC failure.
- [x] Historical runtime fixture/demo state retired; hosted physical-proof seed terminalized as `PAID`.
- [~] Final consolidated quality/hygiene sweep and documentation closeout.
- [ ] Deep-link/QR handoff — optional and deferred to M9 unless it materially improves submission UX.

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
- canonical ProgramData unchanged: `GKggYJQfNJsZn2EqtuasShdKVPKxWUNbv3zg61UPjJgR`

Fresh physical proof:

- hosted Gateway smoke `36303711875` — PASS
- fresh task creation/binding `36303227689` — PASS
- hosted-Gateway Android APK `36303092998` — PASS
- acceptance `36311385406` — PASS
- post-device-failure authoritative state check `36311843338` — PASS
- exact payout verification `36311952353` — PASS
- payout signature `UbpwAKQMUHmFyBGBF9Z7tq76LmS5oHtT8cyA27SG2ZRoWn7Hn4y57HDR9vPhGWNfw3o5deNEHwCeDYVxQYr2Qge`
- worker token delta `+1,000,000` atomic = `+0.001 WSOL`
- vault final amount `0`
- final Android reconciliation: `PAID`

Network-recovery regression:

- RED `36312405844` — stale-authority display test failed before fix
- GREEN `36312595528` — mobile tests + typecheck PASS after fix

**Remaining M8 blocker:** one fresh consolidated repository quality/hygiene sweep must pass after the final cleanup, then documentation can record M8 as complete.

**Exit condition:** hardened flow repeats on a fresh non-canonical task, survives restart/network ambiguity without unsafe replay, and passes the consolidated closeout sweep. **Closeout verification in progress.**

## M9 — Release and hackathon submission

- [ ] Produce the final installable APK from the post-M8 branch state.
- [ ] Verify fresh-device installation of the release candidate.
- [ ] Record final public proof links and reviewer-facing verification instructions.
- [ ] Final README/architecture polish for submission.
- [ ] 90-second demo video.
- [ ] Pitch deck.
- [ ] Submission copy and screenshots.
- [ ] Optional deep-link/QR handoff if it improves the demo.
- [ ] Optional Solana dApp Store readiness work if useful.
- [ ] Submit only after repository, APK, video, deck, and proof links are final.

**Exit condition:** a reviewer can install or inspect the project, understand it quickly, and independently verify the devnet proof.

## Project definition of done

Ground Relay is complete for this project when reproducible proof establishes:

`agent blocked -> funded on-chain task -> worker claims -> camera evidence -> evidence hash -> verifier accepts -> escrow pays worker -> agent resumes`

The repository must also contain reproducible CI/build instructions, a final APK, public verification references, and the hackathon submission materials.
