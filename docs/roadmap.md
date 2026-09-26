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

## M5 — Mobile app -> Anchor integration

- [x] Commit the deployed IDL and guard the Kit client against IDL drift
- [~] Read the real task account from devnet on Android (implemented; physical validation pending)
- [~] Replace the memo-backed mobile claim with real `claim_task` (implemented; physical validation pending)
- [~] Keep camera evidence off-chain and submit its SHA-256 through `submit_evidence` (implemented; physical validation pending)
- [~] Hydrate app status from the on-chain task instead of local-only state (implemented; physical validation pending)
- [~] Display real Anchor transaction receipts (implemented; physical validation pending)
- [~] Add network/program mismatch guards (devnet/program fixed and IDL consistency checked; device validation pending)

**Exit condition:** the physical Android app performs CLAIMED and DELIVERED transitions against the Ground Relay program.

## M6 — Acceptance, payout, and failure paths

- [ ] Poster/verifier accepts valid delivery with `accept_task`
- [ ] `release_payment` transfers the escrowed SPL reward to the worker
- [ ] Verify worker token balance changed by the expected amount
- [ ] Verify the vault cannot pay twice
- [ ] Test wrong-worker, wrong-poster, wrong-mint, underfunded, expired, and invalid-state failures
- [ ] Implement/test open-task cancellation and refund
- [ ] Define and implement expiry/reopen behavior
- [ ] Close/reclaim vault/task rent where appropriate

**Exit condition:** one real devnet task completes OPEN -> CLAIMED -> DELIVERED -> ACCEPTED -> PAID with an observable token transfer.

## M7 — Agent Gateway and resume loop

- [ ] Agent-facing task creation API
- [ ] Persist external task ID <-> on-chain task PDA mapping
- [ ] Delivery/acceptance status endpoint
- [ ] Idempotent callbacks
- [ ] Agent resume callback after settlement
- [ ] Failure/retry semantics
- [ ] Seeded demo: agent blocks, creates task, human completes it, payout occurs, agent resumes

**Exit condition:** Ground Relay proves the full product thesis, not just the mobile transaction flow.

## M8 — Product hardening

- [ ] Task inbox backed by real task data
- [ ] Receipt/history screen
- [ ] Wallet/network recovery states
- [ ] App restart/state restoration
- [ ] Deep-link or QR handoff where useful
- [ ] Evidence privacy review
- [ ] Security review of account constraints, authorities, replay/idempotency, and payment invariants
- [ ] CI coverage for mobile typecheck, Anchor tests, SBF build, and release APK
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

Ground Relay is complete for this project when a reproducible physical-Android demo proves:

`agent blocked -> funded on-chain task -> worker claims -> camera evidence -> evidence hash -> verifier accepts -> escrow pays worker -> agent resumes`

The repository must also contain reproducible CI/build instructions, a final APK, public verification references, and the hackathon submission materials.
