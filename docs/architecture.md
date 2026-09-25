# Ground Relay architecture

## Product loop

1. An autonomous agent reaches a human-only blocker.
2. The agent creates a task with explicit acceptance criteria and funded settlement.
3. A mobile worker discovers and claims the task.
4. The worker captures evidence on Android.
5. A verifier accepts or rejects the delivery.
6. Settlement pays the worker.
7. A callback resumes the originating agent workflow.

## Mobile app

Responsibilities:

- Wallet connection through Solana Mobile Wallet Adapter.
- Open-task inbox.
- Claim authorization.
- Evidence capture.
- Delivery state.
- Settlement receipt.

## Agent gateway

Planned API:

- `POST /v1/tasks`
- `GET /v1/tasks/:id`
- `POST /v1/tasks/:id/deliveries`
- `POST /v1/tasks/:id/verify`
- `POST /v1/tasks/:id/callback`

## Solana layer

The first mobile bootstrap emits a devnet memo receipt when a worker claims a task. The next milestone replaces that receipt-only prototype with a minimal task/escrow program.

State:

`open -> claimed -> delivered -> accepted -> paid`

Cancellation and claim-expiry transitions are explicit.

Evidence itself remains off-chain. Ground Relay stores/verifies hashes and settlement references, limiting both cost and accidental disclosure.

## Security model

- Wallet signing always happens through MWA.
- The backend never receives worker private keys.
- No secrets are committed to source.
- No worker capital/deposit is required.
- Development uses devnet by default.
