# On-chain task escrow

Ground Relay's MVP escrow program is intentionally small. Evidence content stays off-chain; Solana stores task state, worker assignment, evidence hash and token settlement.

## PDA model

Task PDA:

`["task", poster_pubkey, task_id_32]`

Vault token PDA:

`["vault", task_pubkey]`

The task PDA is the token authority of the vault.

## State machine

`Open -> Claimed -> Delivered -> Accepted -> Paid`

An `Open` task may also move to `Cancelled` and refund the poster.

## Instructions

### post_task

Poster creates the task PDA and token vault, then transfers the exact reward amount into escrow.

### claim_task

Any worker may claim an unexpired open task. The worker public key becomes immutable for the task.

### submit_evidence

Only the assigned worker can submit the 32-byte evidence hash. The evidence object itself stays off-chain.

### accept_task

Only the poster can accept a delivered task.

### release_payment

After acceptance, the assigned worker signs the release call. The task PDA signs the token CPI and transfers the escrowed reward to the worker's token account.

### cancel_open_task

Only the poster can cancel an unclaimed task. The vault transfers the reward back.

## Security properties in the MVP

- Reward is escrowed before a task becomes available.
- Worker cannot alter poster, mint, amount or task id.
- Poster cannot mark someone else as the worker.
- Evidence commitment is immutable after delivery.
- Payment requires the task to have been explicitly accepted.
- Token accounts are constrained to the task's mint and authorities.
- Program PDA, rather than either human party, controls escrow funds.

## Before devnet deployment

The program still needs:
- LiteSVM/Anchor integration tests for all transitions and failure cases.
- Explicit claim-expiry/reopen semantics.
- Vault close/rent reclamation.
- IDL/client generation.
- Program keypair matching the committed program id.
- Security review of token-program compatibility and duplicate task-id behavior.
