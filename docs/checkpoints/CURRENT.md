# Current checkpoint

**Date:** 2026-09-25  
**Stage:** M3 — first real devnet deployment  
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
- passes the five transition-guard tests
- builds reproducible SBF + IDL artifacts
- has a guarded devnet deployment workflow
- uses a controlled program identity stored outside git

## Controlled devnet identity

Program ID:

`6v2peeoZVj2AXfczVLqyMUTHYt3XQPqAxCktpTwjUZap`

Dedicated deployer public address:

`6WG3UpKV9vBRh4XR961eZGpPZcHVGdxqpM3Eten5quuZ`

Program identity commit:

`e732977cd38e3b87f2d986d2609ff243fd08efd2`

The devnet RPC preflight confirmed the program account was **ABSENT** before first deployment, which is the expected pre-deploy state.

## Build evidence

Anchor program CI for the controlled identity: success.

Anchor SBF + IDL build #7: success.

Previously verified SBF size was approximately 230,680 bytes. The earlier rent-exempt reference for that binary size was 1.17250464 devnet SOL; actual deployment funding requirements may differ.

## Active operation

The first guarded deployment workflow has already been dispatched:

- workflow: `Deploy Anchor program to devnet`
- run ID: `36200403226`
- trigger: manual `workflow_dispatch`
- confirmation value: `DEPLOY-DEVNET`
- state at checkpoint creation: **in progress**

The operator reported funding the dedicated deployer through the Solana devnet faucet. The deployment workflow must independently verify the actual balance before deploying.

## Important limitations

The currently proven Android flow still uses Solana Memo transactions for claim/delivery receipts. It does **not** yet invoke the custom Anchor escrow program.

The displayed `1.00 USDC` in the prototype is a demo label, not evidence of a real escrow payout.

No production/mainnet deployment is authorized by this checkpoint.

## Do not repeat

- Do **not** run the devnet identity bootstrap again.
- Do **not** regenerate the program keypair.
- Do **not** overwrite the two deployment GitHub Secrets.
- Do **not** change `declare_id` or the program ID just to fix an ordinary build/deploy error.
- Do **not** commit keypairs, seed phrases, wallet secrets, or auth tokens.

## Next recommended action

Inspect deployment run `36200403226`.

If it succeeds: verify the program account through devnet RPC/Explorer, record deployment metadata, archive this checkpoint, and advance to M4 (create a real funded escrow task).

If it fails: diagnose only the failing deployment step while preserving the controlled program identity and Secrets.
