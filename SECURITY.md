# Security Policy

Ground Relay is a hackathon-stage, devnet-only system. This document describes the security boundaries that reviewers should use when evaluating the repository.

## Supported scope

The current verified release and on-chain evidence target Solana devnet only. No mainnet deployment or production-readiness claim is made.

## Security model

Ground Relay separates responsibilities across three components:

- **Android worker app** — the worker wallet authorizes worker-side transactions through Solana Mobile Wallet Adapter.
- **Agent Gateway** — stores discovery/recovery context and resume state, but does not hold worker or poster signing keys and does not authorize settlement.
- **Anchor escrow program** — enforces the funded task state machine and settlement constraints on-chain.

After a task is bound, Solana is the authoritative source for task status and settlement.

## Fail-closed rules

The mobile app must not enable state-changing actions when the exact selected task cannot be reconciled against the expected program and accounts.

The app does not automatically replay a transaction after an ambiguous wallet return, network outage, RPC failure, or restart. It reconciles with Solana first.

## Evidence privacy

Raw evidence photos remain local to the device in the verified flow. Only a task-bound SHA-256 digest is submitted to the protocol. See `docs/security/evidence-privacy.md`.

## Escrow protections

The deployed devnet program includes canonical PDA constraints, token-account validation, exact credited-token checks, payout/refund guards, recovery paths and terminal receipt handling. See `docs/escrow-protocol.md` and `docs/checkpoints/archive/2026-09-27-m8-complete.md`.

## Gateway / callback protections

The Gateway is non-custodial and its callback path is designed as retryable, at-least-once delivery until acknowledgement. It does not claim exactly-once HTTP transport. Callback targets are subject to URL/DNS/public-address validation and bounded redirect handling in the hardened implementation.

## Secrets

Do not commit:

- wallet seed phrases or private keys;
- deployment keypairs;
- RPC credentials or paid-provider secrets;
- API tokens;
- signing material.

Signing material used by CI is supplied through environment-level secrets and temporary files rather than repository contents.

## Verified recovery incident

During the physical devnet payout, a DNS/RPC failure occurred after the wallet transaction had already reached Solana. Ground Relay did not replay the payment. Independent verification found the task in `PAID`, and the app later reconciled to the same terminal state after network recovery.

Regression evidence:

- RED run `36312405844`
- GREEN run `36312595528`

Exact payout audit:

- run `36311952353` — PASS

## Audit entrypoint

Reviewers should start with `AUDIT.md`, which maps source directories, tests, CI, deployment evidence, transaction proofs and release hashes.

## Reporting

For the hackathon period, security findings should be reported privately to the repository owner rather than posted with secrets, exploit material, or private user data in a public issue.
