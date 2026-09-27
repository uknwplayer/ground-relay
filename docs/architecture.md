# Ground Relay architecture

Ground Relay is a non-custodial human escalation layer for autonomous agents. The system turns a human-only blocker into a funded Solana task, gives an Android worker a safe execution surface, and resumes the originating agent only after authoritative settlement.

## Product loop

1. An autonomous agent reaches a human-only, device-local, or real-world blocker.
2. The Agent Gateway records the task/callback contract and the task is bound to a funded Solana escrow PDA.
3. A mobile worker discovers the task through the worker-safe inbox.
4. The Android app reconciles the selected task PDA against Solana before enabling state-changing actions.
5. The worker claims the task through Mobile Wallet Adapter.
6. The worker captures evidence on-device; photo bytes stay local and only a SHA-256 evidence hash is submitted on-chain.
7. The poster/verifier accepts the delivery.
8. The assigned worker releases the verified escrow payout to the canonical worker token account.
9. The Gateway observes authoritative `PAID` state and delivers the persisted resume callback at least once until acknowledged.

Canonical state path:

`OPEN -> CLAIMED -> DELIVERED -> ACCEPTED -> PAID`

Explicit cancellation, expiry, and timeout recovery paths exist; terminal states never regress.

## Mobile app

Responsibilities:

- Solana Mobile Wallet Adapter connection and signing.
- Worker-safe Gateway inbox discovery.
- Exact selected-task PDA restoration across restart.
- Authoritative Solana reconciliation before transaction eligibility.
- Claim transaction construction for the selected task.
- Camera evidence capture and on-device SHA-256 hashing.
- Local evidence-photo cleanup after delivery/terminal handling.
- Delivery receipt/history display with source distinctions.
- Generic payout context derivation for the selected task.
- Verification of canonical vault, worker classic-SPL ATA, mint, authority, token-program owner, and vault funding before payout.
- Ambiguous wallet-return reconciliation without automatic replay.
- Fail-closed behavior when RPC/Gateway state cannot be verified.

The mobile cache is recovery context only. It never authorizes a transaction.

## Agent Gateway

The Gateway is non-custodial and contains no worker/poster signing secrets.

Primary responsibilities:

- durable task persistence;
- create idempotency;
- task-to-Solana-PDA binding;
- worker-safe inbox projection;
- Solana-authoritative synchronization after binding;
- persisted paid-resume event identity;
- retry/backoff across restart;
- manual retry after terminal callback failure;
- at-least-once HTTP resume delivery until acknowledgement.

Key endpoints include:

- `GET /health`
- `GET /v1/tasks`
- `POST /v1/tasks`
- `PUT /v1/tasks/:id/chain-binding`
- `POST /v1/tasks/:id/sync`
- `POST /v1/tasks/:id/paid`
- `POST /v1/tasks/:id/resume/retry`

Callback transport is hardened against common SSRF patterns through URL policy checks, DNS resolution, public-address enforcement, connection pinning, TLS hostname preservation, and bounded/revalidated redirects.

Ground Relay deliberately does **not** claim exactly-once HTTP transport.

## Solana layer

Controlled devnet Program ID:

`6v2peeoZVj2AXfczVLqyMUTHYt3XQPqAxCktpTwjUZap`

The Anchor program implements funded task escrow and authoritative lifecycle state.

Core instructions:

- `post_task`
- `claim_task`
- `submit_evidence`
- `accept_task`
- `release_payment`
- cancellation/refund and claimed-task timeout recovery
- terminal empty-vault reclamation

Hardening properties include:

- canonical task-PDA constraints;
- exact credited-token checks on funding, payout, and refund;
- classic SPL Token / no-freeze-authority policy for new escrows;
- evidence deadline enforcement;
- original-poster-only timeout recovery and terminal rent reclamation;
- retained task PDA as the durable authoritative receipt.

Evidence bytes remain off-chain. The program stores the evidence hash and settlement state.

## Trust boundaries

### Worker wallet

The worker signs worker-authorized transitions through Mobile Wallet Adapter. Ground Relay never receives the worker private key.

### Poster / verifier

The poster controls acceptance and poster-only recovery paths. Poster signing material is never exposed to the mobile worker or Gateway.

### Agent Gateway

The Gateway coordinates discovery, durable callback state, and resume delivery. It cannot move escrow funds because it is not a signer.

### Solana

Once a task is bound, Solana is authoritative for lifecycle and settlement. Gateway/cache data may be stale and is never sufficient to enable a transaction.

## Failure and recovery model

Ground Relay assumes mobile wallet calls, DNS, RPC access, process lifetime, and HTTP callbacks can fail independently.

Safety rules:

- no automatic replay of state-changing transactions after restart;
- ambiguous wallet returns are reconciled against chain state first;
- unavailable RPC produces an unreconciled/unknown presentation, not stale Gateway authority;
- state-changing actions stay locked until the exact selected PDA is reconciled;
- resume callbacks use stable event/idempotency identity and persisted retry state;
- terminal paid/cancelled state never regresses.

The hardened M8 physical proof exercised a real DNS/RPC failure after the payout transaction had already reached Solana. The app did not replay the payout and later reconciled correctly to `PAID`.

## Deployment scope

Current public proofs and deployment target **Solana devnet only**. No mainnet deployment is authorized by the repository or the M9 release work.

The public hosted Gateway used for the physical proof is:

`https://ground-relay-agent-gateway-m8.onrender.com`
