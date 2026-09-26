# Current checkpoint

**Date:** 2026-09-25  
**Stage:** M4 — real funded escrow fixture  
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

- controlled program identity check passed
- deployer balance before deployment: `2.5 SOL` on devnet
- program build completed successfully
- Anchor reported program ID `6v2peeoZVj2AXfczVLqyMUTHYt3XQPqAxCktpTwjUZap`
- Anchor reported `Deploy success`
- IDL metadata was initialized
- metadata account reported by Anchor: `7GuXcvE5MrKneC5vSAcyZZHmQ8k1Pm7NhNHTGDTBmqWp`

The original workflow was marked failed only because its final `solana program show` verification command expected a default signer.

That verification path has now been replaced by a signer-free JSON-RPC check.

Independent devnet verification run:

- workflow: `Devnet program preflight`
- run ID: `36202453116`
- conclusion: **success**
- program account: **PRESENT**
- executable: **true**
- owner: `BPFLoaderUpgradeab1e11111111111111111111111`
- lamports: `833120`

**M3 deployment verification is complete.**

Signer-free upgradeable-loader inspection also confirmed:

- ProgramData account: `GKggYJQfNJsZn2EqtuasShdKVPKxWUNbv3zg61UPjJgR`
- ProgramData owner: `BPFLoaderUpgradeab1e11111111111111111111111`
- last deployed slot: `504203568`
- upgrade authority: `6WG3UpKV9vBRh4XR961eZGpPZcHVGdxqpM3Eten5quuZ`
- metadata/IDL and deployment-related successful signatures observed at the program address:
  - `Di2A3dxVkSpoWuZ1aru3FTrNEc6hofQPj6fpqaBPTWn8a6YuNZFVR4RN38v7Yj7739GXgiFq7AALhaBUYT4gtgy`
  - `KLqP3nkjxsPRthoZmCgLVJFc17QH6K2qKzgDUweGg6S7ySTuJHRo6D6KahNzmQ6wUA8AVkdkjfbv3yYGgzsPtBm`
  - `4HDyt5VsjoHGyBUgcaxZxKPHnf68H4QH8Xo7vADcefF5CGwmy19Tnh8SZqA4R8pi9jcfB7giJQ44xmi7g6TCcuoj`

Program metadata inspection workflow:
- run ID: `36203230625`
- conclusion: **success**


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

## Active M4 operation

A repeatable devnet escrow fixture workflow is now running:

- workflow: `Create devnet escrow fixture`
- run ID: `36203365279`
- fixture client uses the controlled deployer as poster
- worker public key is resolved from the already-proven mobile claim receipt
- reward asset is devnet WSOL
- target reward: `1,000,000` atomic units = `0.001 WSOL`
- deterministic fixture key: `ground-relay-devnet-escrow-v1`

The workflow creates/validates poster and worker WSOL token accounts, creates the deterministic task PDA with `post_task`, funds the program vault, and verifies the resulting on-chain state.

## Next recommended action

Wait for run `36203365279` to finish.

If it succeeds: record task/vault/token-account addresses and the `post_task` signature, mark M4 complete, and begin M5 mobile -> Anchor integration.

If it fails: repair only the fixture/client step while preserving the deployed program identity, deployment Secrets, and proven mobile memo flow.
