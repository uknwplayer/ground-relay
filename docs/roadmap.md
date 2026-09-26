# Ground Relay roadmap

This roadmap is the project execution plan from the completed prototype work to a finished hackathon-ready product.

## Status legend

- [x] complete and evidenced
- [~] in progress
- [ ] not started

## M0 — Project foundation

- [x] CLOCK IN project/repository established
- [x] Public GitHub repository
- [x] Android / Expo / React Native baseline
- [x] Solana devnet chosen as the development network
- [x] CI and standalone APK workflow established

**Exit condition:** reproducible repository and Android build foundation.

## M1 — Mobile human-in-the-loop prototype

- [x] Solflare connection through Mobile Wallet Adapter on a physical Android device
- [x] Worker wallet returned to the app
- [x] Devnet claim receipt submitted and confirmed
- [x] Camera evidence capture on-device
- [x] SHA-256 evidence hashing on-device
- [x] Devnet delivery receipt submitted and confirmed
- [x] Local task progression OPEN -> CLAIMED -> DELIVERED
- [x] Claim and delivery signatures displayed in the app

**Evidence:**
- claim: `23My4fQYQy3vp6YpkSPRfLFBMqkLuusmZJFN92pGB9mjjATAwKSamXjQVZxT8Giy3Ekii8QLeT8SofRzavKc3BTy`
- delivery: `5hycogT2MMUKfnXTuYgS1jgzvP6atyeBAEsEoEzpjGdFYUD4dXzB53EfUPHnqA6xwzVkLtw6krRwStDQyQKvEQGN`

**Exit condition:** a real Android device proves wallet -> claim receipt -> camera -> evidence hash -> delivery receipt.

## M2 — Anchor escrow program readiness

- [x] Anchor task/escrow state machine implemented
- [x] `post_task`
- [x] `claim_task`
- [x] `submit_evidence`
- [x] `accept_task`
- [x] `release_payment`
- [x] `cancel_open_task`
- [x] Transition guard tests for claim, submission, acceptance, payout, and cancellation
- [x] Reproducible SBF + IDL build in GitHub Actions
- [x] Private deployment material excluded from git
- [x] Controlled devnet program identity created and stored through GitHub Actions Secrets
- [x] `declare_id` and `Anchor.toml` aligned

Controlled devnet program ID:

`6v2peeoZVj2AXfczVLqyMUTHYt3XQPqAxCktpTwjUZap`

**Exit condition:** tested program, reproducible artifacts, and a controlled deployment identity.

## M3 — First real devnet deployment

- [x] Deploy the Anchor program to devnet
- [x] Verify the program account is executable at the controlled program ID
- [x] Record deployment transaction/signature and program metadata
- [x] Confirm upgrade authority and deployment ownership
- [x] Confirm no program-code fix is required after deployment verification
- [x] Write a deployment checkpoint

**Rule:** do not regenerate the program identity or deployment Secrets merely to fix a deployment error.

**Exit condition:** the Ground Relay Anchor program exists and is verifiably executable on Solana devnet.

## M4 — Real escrow fixture on devnet

- [x] Select a clearly labeled devnet payment asset for the demo (WSOL)
- [x] Create poster and worker token accounts
- [x] Create a real task PDA with `post_task`
- [x] Fund the task vault with the reward
- [x] Verify task PDA, vault PDA, mint, amount, poster, status, and expiry on-chain
- [x] Add a repeatable script/test fixture without exposing private keys

**Exit condition:** an OPEN task exists on-chain with an actually funded escrow vault.

The canonical M4 fixture has since completed the full lifecycle and is now legitimately `PAID`; it remains the end-to-end proof and should not be reset or impersonated as a fresh OPEN task.

## M5 — Mobile app -> Anchor integration

- [x] Commit the deployed IDL and guard the Kit client against IDL drift
- [x] Read the real task account from devnet on a physical Android device
- [x] Replace the memo-backed mobile claim with real `claim_task`
- [x] Keep camera evidence off-chain and submit its SHA-256 through `submit_evidence`
- [x] Hydrate app status from the on-chain task instead of local-only state
- [x] Display real Anchor transaction/state receipts
- [x] Add network/program mismatch guards
- [x] Reconcile ambiguous Mobile Wallet Adapter returns against authoritative on-chain state
- [x] Add regression tests for claim/delivery/payout reconciliation

Physical proof completed:

`OPEN -> CLAIMED -> DELIVERED -> ACCEPTED -> PAID`

Payout transaction:

`4miSuLtKtHANH7Auv52FbQECCyiPc9gQioo5qENWS8izvyeQtHwPgMZad7W9GyGKJ9MzyYyUD8P6pW9qvM92kpEk`

Independent post-payout inspection run: `36207197941`.

**Exit condition:** the physical Android app performs direct Anchor transitions against the Ground Relay program. **Complete.**

## M6 — Acceptance, payout, and failure paths

- [x] Poster/verifier accepts valid delivery with `accept_task`
- [x] `release_payment` transfers the escrowed SPL reward to the worker
- [x] Verify worker token balance changed by the expected amount
- [x] Prove a paid task cannot pay twice on devnet and balances remain unchanged after rejection
- [x] Prove wrong-worker rejection on devnet
- [x] Prove wrong-poster rejection on devnet
- [x] Prove release-before-acceptance and other invalid-state rejection on devnet
- [x] Prove expired tasks cannot be claimed on devnet
- [x] Implement/test open-task cancellation and exact escrow refund on devnet
- [x] Define expiry/reopen policy: expired OPEN tasks are cancelled/refunded; reopening uses a new task ID
- [x] Keep `WrongMint` and `EscrowUnderfunded` defense-in-depth validator coverage; normal initialized state structurally prevents manufacturing those conditions

Verified successful settlement evidence:

- acceptance signature: `4QVs7r2xBgSNzZHm8z3N5jbJZKVNCAT4cXEw9pTCqVRv79DchyYDfjnUXUsDJCVWuWFZCZ6WJYE1zTBrDoHSF8Hd`
- physical payout signature: `4miSuLtKtHANH7Auv52FbQECCyiPc9gQioo5qENWS8izvyeQtHwPgMZad7W9GyGKJ9MzyYyUD8P6pW9qvM92kpEk`
- canonical final vault amount: `0`
- canonical final worker token amount: `1,000,000` atomic WSOL

Isolated guard suite:

- workflow run: `36208008464`
- wrong worker: PASS
- wrong poster: PASS
- premature release: PASS
- second payout rejected with state/balances unchanged: PASS
- expired claim: PASS
- cancellation/refund: PASS
- second cancellation and claim-after-cancel: PASS

Detailed proof: `docs/checkpoints/archive/2026-09-26-m6-devnet-guards.md`.

**Exit condition:** successful settlement plus critical adversarial/lifecycle paths are demonstrated. **Complete.**

Task/vault rent reclamation is intentionally moved to M8 hardening because it requires a deliberate account-closure/API policy and is not required for settlement correctness.

## M7 — Agent Gateway and resume loop

- [x] Durable agent-facing task creation API with required callback URL
- [x] Persist external task ID <-> on-chain task PDA/post signature mapping
- [x] Authoritative Solana task synchronization for bound tasks
- [x] Persist task/idempotency/callback state across Gateway restart
- [x] Idempotent create semantics with conflict detection
- [x] Stable resume event ID and `Idempotency-Key`
- [x] Verified PAID settlement notification; a client cannot mark an unpaid task paid
- [x] Actual agent resume callback after settlement
- [x] Retry/failure classification with persisted +1s/+2s/+4s/+8s/+16s backoff
- [x] Restart recovery for pending callback retries
- [x] Manual retry for an existing undelivered resume event
- [x] Bound tasks reject local state mutation with `chain_authoritative`
- [x] Deterministic seeded demo proves agent blocked -> task bound -> chain paid -> callback -> agent resumed -> restart -> no duplicate callback
- [x] Gateway remains non-custodial and stores no signing secrets

M7 deterministic proof:

- workflow: `Gateway check`
- run: `36211748985`
- tests: `48/48` passed
- seeded demo: **PASS**
- callback count before restart: `1`
- callback count after restart: `1`
- deterministic event ID: `4deaf25af94d670a6d27317c6e128e5f8eff0779aabbe41fa22df19a1e3595a5`

Detailed proof: `docs/checkpoints/archive/2026-09-26-m7-agent-resume.md`.

**Exit condition:** Ground Relay proves the agent-resume product thesis beyond the mobile payment transaction. **Complete.**

## M8 — Product hardening

- [ ] Task inbox backed by real task data
- [ ] Receipt/history screen
- [~] Wallet/network recovery states — on-chain reconciliation for ambiguous MWA transaction returns is implemented and regression-tested
- [ ] App restart/state restoration
- [ ] Deep-link or QR handoff where useful
- [ ] Evidence privacy review
- [ ] Security review of account constraints, authorities, replay/idempotency, callback/SSRF policy, and payment invariants
- [ ] Define and implement task/vault rent reclamation policy for terminal tasks
- [x] CI runs mobile typecheck plus Node regression tests; Anchor/SBF/APK/Gateway workflows remain separate
- [ ] Remove or clearly label all demo-only values and memo prototype behavior

**Exit condition:** the demo is robust enough to repeat without manual repair.

## M9 — Release and hackathon submission

- [ ] Produce final installable APK
- [ ] Verify fresh-device installation
- [ ] Run one final end-to-end devnet proof and record every relevant signature/address
- [ ] Final README and architecture documentation
- [ ] 90-second demo video
- [ ] Pitch deck
- [ ] Submission copy and screenshots
- [ ] Optional Solana dApp Store readiness work if useful for the hackathon
- [ ] Submit only after the repository, APK, video, deck, and proof links are final

**Exit condition:** a reviewer can install or inspect the project, understand it quickly, and independently verify the devnet proof.

## Project definition of done

Ground Relay is complete for this project when the combined reproducible proof establishes:

`agent blocked -> funded on-chain task -> worker claims -> camera evidence -> evidence hash -> verifier accepts -> escrow pays worker -> agent resumes`

The repository must also contain reproducible CI/build instructions, a final APK, public verification references, and the hackathon submission materials.
