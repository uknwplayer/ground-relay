# M6 devnet settlement guard proof

**UTC date:** 2026-09-26  
**Workflow:** `M6 devnet settlement guards`  
**Run:** `36208008464`  
**Result:** **PASS**

This proof uses isolated devnet tasks and ephemeral worker/intruder signers. It does not mutate or reset the canonical physical-Android payout fixture.

## Settlement guard fixture

- task PDA: `FygXe1eSjptQPLuScAY9E6755mNZFccyZWUgKysKij9t`
- vault PDA: `7qnhbvZb3rVBFrs4zkcCgZGpeUMtQ25S2RxyPDVgHe6B`
- ephemeral worker: `6jr8ibmc8ADtpMg2B2bJhCmUxEaZ5GXMtKWKa63sHyDV`
- ephemeral intruder: `449obGq64rA7wMthMq91UjCyhTta5LyKih9M25DNrGVu`
- worker WSOL ATA: `fVuKxYoc24FxmZqwDbX3Q7br4D8iPqSDUr1yWQKRkaK`
- evidence hash: `7e012ec7056e47c48feee571a8460bcb0676201d00127633a7de2a34750970a0`

Successful transactions:

- `post_task`: `2xniQeRFe3PNfvQmUATC1jNqqyayC4uTYmqnTLqQtaL4Bhu6zoKMpG7h2mFCUMQcNHTtR3bmExE3zH61ZXg6jDot`
- `claim_task`: `4BDwPRW7su6UxkLBs1jYY24JdrE3QR2jEcMwhZcNJ6Sq4gdFAugJXUEbWSsQSfsq7vGPstjFLVTr8HM7CY8j7D1p`
- `submit_evidence`: `2WS7PEou72skzhAKFMnCzdB6CYtTSF1qiyup2FT7RdXqKDUFvt5acBr93nFPMqndRWJURRQ6nbKnWnUem4YCjUg7`
- `accept_task`: `2YnzuGCFxnHrh3yGmounjYfySm2FBUGxj33Di8ST1qSizejunwy1nunpEXSTmTBMaMw9Tqiq58uuLZ6zTHPYnzQN`
- `release_payment`: `5Mg25EWwrSiPhJdibUCThZcKNeRDGUXBzr2H8j6wj4TGqozTpZN5WX1z18yth7CRZGpnXbkr4U7ZhXtLJCrnucnQ`

The suite verified the first payout reached `PAID`, the vault reached zero, and the worker token balance increased by exactly `1,000,000` atomic WSOL.

## Rejections proven on devnet

The following attempted state transitions were deliberately sent and rejected with the expected Ground Relay error:

- wrong worker submitting evidence -> `WrongWorker`
- release before poster acceptance -> `InvalidStatus`
- wrong poster accepting delivery -> `WrongPoster`
- second payout after `PAID` -> `InvalidStatus`
- claiming an already paid task -> `InvalidStatus`

After the rejected second payout, the suite independently re-read state and balances and proved:

- worker token balance did not change
- vault remained `0`
- task remained `PAID`

**Double-pay prevention is therefore proven on devnet, not only by a unit test.**

The ephemeral worker's WSOL was transferred back to the controlled poster WSOL account and the temporary worker token account was closed after the guard proof.

## Expiry and cancellation/refund fixture

- task PDA: `2TMCpcBwn3QUHpbZeio9SMGgyLfh7B4QYJncE37cHgLE`
- vault PDA: `EdEcJKWAVZsmQvoDGSCNGTyZguFZjd49W97jqMyvBa6E`
- ephemeral worker: `3JPKbskBc3m13B3okr624KTFG5aDrj87CRK2QHFK7PEF`
- poster WSOL baseline before posting: `1,000,000`

Transactions:

- `post_task`: `2HcjBtAWvUVA7Yjg4CU5L6eZSomQRRfYg8fqoNwPqT9QMxvZt3nRfiJy9RPERSyyeXdUerzZQuW11USUzhvSd9h2`
- `cancel_open_task`: `3YfiDojJxsmCajYxvcc3HZP2MZ3RVm2vf14VLhtLjw8n4JrzHJ4jb7yqNbzRpgXNqQaKmxUygdovkpwR8hCtE9ZC`

The suite waited until the task was expired and proved:

- an expired claim is rejected with `TaskExpired`
- the poster can cancel the still-OPEN expired task
- cancellation moves the task to `CANCELLED`
- the vault becomes `0`
- poster WSOL returns exactly to the `1,000,000` atomic baseline
- a second cancellation is rejected with `InvalidStatus`
- a cancelled task cannot be claimed (`InvalidStatus`)

## Expiry/reopen policy established by the existing program

The demonstrated lifecycle is:

1. an expired OPEN task remains on-chain but becomes unclaimable;
2. the poster cancels the OPEN task to recover escrow;
3. reopening is represented by posting a **new task ID**, rather than mutating the historical expired/cancelled task.

This keeps terminal and historical task records immutable and avoids ambiguous revival semantics.

## Defense-in-depth guards not manufactured on devnet

`WrongMint` and `EscrowUnderfunded` are covered by the program's validator unit tests, but are not normal reachable states for a correctly initialized legacy-token fixture:

- `post_task` records the same mint used to initialize the vault;
- release/cancel account constraints require the vault mint to equal the supplied mint and the vault authority to be the task PDA;
- `post_task` funds the exact reward;
- no public instruction can drain the task-owned vault without performing a terminal release/cancel transition.

Forcing those states on devnet would require corrupting program-owned state or changing the program solely to manufacture an impossible fixture, which would weaken rather than strengthen the proof. The checks remain as defense in depth.

## M6 conclusion

The critical settlement failure and lifecycle paths are proven:

- double-pay prevention
- wrong-worker authorization
- wrong-poster authorization
- invalid-state rejection
- expiry rejection
- cancellation/refund
- terminal-state immutability

Account/vault rent reclamation is intentionally deferred to later product hardening because it requires a deliberate account-closure policy and program/API change; it is not required for settlement correctness.
