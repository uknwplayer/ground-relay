# Current checkpoint

**Date:** 2026-09-25  
**Stage:** M3 — post-deploy verification  
**Repository:** `uknwplayer/ground-relay`

## Verified working state

The physical Android prototype is proven through the memo-backed mobile flow:

`wallet -> claim receipt -> camera evidence -> SHA-256 -> delivery receipt`

The app successfully connects to Solflare through Mobile Wallet Adapter on a physical Android device and advances OPEN -> CLAIMED -> DELIVERED.

Confirmed memo-backed devnet receipts:

- claim: `23My4fQYQy3vp6YpkSPRfLFBMqkLuusmZJFN92pGB9mjjATAwKSamXjQVZxT8Giy3Ekii8QLeT8SofRzavKc3BTy`
- delivery: `5hycogT2MMUKfnXTuYgS1jgzvP6atyeBAEsEoEzpjGdFYUD4dXzB53EfUPHnqA6xwzVkLtw6krRwStDQyQKvEQGN`

The Anchor escrow program:

- compiles in dedicated CI
- passes five transition-guard tests
- builds reproducible SBF + IDL artifacts
- has a guarded devnet deployment workflow
- uses a controlled deployment identity stored outside git

## Controlled devnet identity

Program ID:

`6v2peeoZVj2AXfczVLqyMUTHYt3XQPqAxCktpTwjUZap`

Dedicated deployer public address:

`6WG3UpKV9vBRh4XR961eZGpPZcHVGdxqpM3Eten5quuZ`

Program identity commit:

`e732977cd38e3b87f2d986d2609ff243fd08efd2`

Before deployment, the signer-free devnet RPC preflight confirmed the program account was absent, which was the expected pre-deploy state.

## Build evidence

- Anchor program CI for the controlled identity: success
- Anchor SBF + IDL build #7: success
- previously observed SBF size: approximately 230,680 bytes
- earlier rent-exempt reference for that binary size: 1.17250464 devnet SOL

## First guarded devnet deployment

Workflow:

`Deploy Anchor program to devnet`

Run ID:

`36200403226`

Observed during the run:

- deployment Secrets loaded successfully
- controlled program identity check passed
- `declare_id`, `Anchor.toml`, and program keypair all matched
- deployer: `6WG3UpKV9vBRh4XR961eZGpPZcHVGdxqpM3Eten5quuZ`
- deployer balance before deployment: `2.5 SOL` on devnet
- program build completed successfully
- Anchor reported program ID `6v2peeoZVj2AXfczVLqyMUTHYt3XQPqAxCktpTwjUZap`
- Anchor reported `Deploy success`
- IDL metadata was initialized
- metadata account reported by Anchor: `7GuXcvE5MrKneC5vSAcyZZHmQ8k1Pm7NhNHTGDTBmqWp`

The overall workflow conclusion is **failure**, but the failure occurred only in the subsequent verification step. The command `solana program show` was invoked without a configured default signer and returned `No default signer found`.

Therefore the deployment is treated as **reported successful by Anchor but not yet independently verified**.

## Documentation state

Evaluator-facing documentation is organized from the repository README.

Key documents:

- `docs/product-anatomy.md` — complete product/system anatomy
- `docs/roadmap.md` — execution roadmap to completion
- `docs/architecture.md` — concise architecture
- `docs/escrow-protocol.md` — on-chain escrow design
- `docs/openapi.yaml` — Agent Gateway API contract
- `docs/checkpoints/CURRENT.md` — this canonical handoff

## Important limitations

The currently proven Android flow still uses Solana Memo transactions for claim/delivery receipts. It does **not** yet invoke the custom Anchor escrow program from the mobile app.

The displayed `1.00 USDC` in the prototype is a demo label, not evidence of a real escrow payout.

No production/mainnet deployment is authorized by this checkpoint.

## Do not repeat

- Do **not** run the devnet identity bootstrap again.
- Do **not** regenerate the program keypair.
- Do **not** overwrite the two deployment GitHub Secrets.
- Do **not** change `declare_id` or the program ID just to fix an ordinary verification/build error.
- Do **not** commit keypairs, seed phrases, wallet secrets, or auth tokens.

## Next recommended action

Independently verify that program account `6v2peeoZVj2AXfczVLqyMUTHYt3XQPqAxCktpTwjUZap` is present and executable on devnet using a signer-free RPC query or corrected verification workflow.

If present and executable: record the on-chain program metadata, close M3, archive this checkpoint, and advance to M4 — create a real funded escrow task.

If verification fails: diagnose the account state while preserving the existing program identity and deployment Secrets.
