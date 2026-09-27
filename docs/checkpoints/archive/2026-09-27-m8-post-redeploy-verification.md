# M8 post-redeploy devnet verification

**UTC date:** 2026-09-27  
**Branch:** `m8-product-hardening`  
**Network:** Solana devnet

This checkpoint records the fresh signer-free verification performed after the latest controlled deployment of the hardened M8 Anchor program.

## Latest controlled deployment

- workflow: `Deploy Anchor program to devnet`
- run: `36296759500` — PASS
- branch commit deployed: `b58718faa6cd46b552e5b83e6c9346edd669a1e9`
- build step: PASS
- devnet payer/funding step: PASS
- deploy step: PASS
- deploy workflow post-check: PASS
- key-material cleanup: PASS

The branch commit changed documentation only relative to the already-hardened program, so this deployment preserves the same hardened SBF behavior and controlled program identity.

## Fresh independent signer-free verification

The existing `Devnet program preflight` workflow was re-run after the deployment so the verification would not depend on the deployment signer or the deploy workflow's own post-check.

- run: `36296153445`, attempt 2 — PASS
- Program ID: `6v2peeoZVj2AXfczVLqyMUTHYt3XQPqAxCktpTwjUZap`
- program account: PRESENT
- owner: `BPFLoaderUpgradeab1e11111111111111111111111`
- executable: `True`
- canonical ProgramData: `GKggYJQfNJsZn2EqtuasShdKVPKxWUNbv3zg61UPjJgR`
- ProgramData owner: `BPFLoaderUpgradeab1e11111111111111111111111`
- ProgramData data length: `254,189` bytes (`45` loader metadata + `254,144` SBF)
- last deployed slot: `504672943`
- upgrade authority: `6WG3UpKV9vBRh4XR961eZGpPZcHVGdxqpM3Eten5quuZ`
- confirmed RPC context slot: `504690023`

Verification result:

`PASS — executable program, canonical ProgramData, slot, and upgrade authority match devnet expectations`

## Interpretation

The hardened M8 Anchor program is live on Solana devnet under the original controlled Program ID, ProgramData address, and upgrade authority. This checkpoint does not authorize or imply any mainnet deployment.

M8 is still not complete: the next blocker is the fresh non-canonical physical Android end-to-end proof covering discovery/selection, claim, restart/recovery, evidence, acceptance, generic verified payout, and final PAID reconciliation.
