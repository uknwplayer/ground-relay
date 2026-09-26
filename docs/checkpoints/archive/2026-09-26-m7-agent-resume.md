# M7 Agent Gateway + Resume Loop Proof

**Local date:** 2026-09-25  
**UTC date:** 2026-09-26  
**Milestone:** M7 — Agent Gateway and resume loop  
**Result:** PASS

## What M7 proves

Ground Relay now has a restart-safe, non-custodial Agent Gateway that can correlate an autonomous agent's external task ID with a Ground Relay Solana task, treat the bound on-chain account as authoritative, and resume the originating agent only after verified PAID settlement.

The demonstrated logical loop is:

`agent blocked -> durable task -> verified task/PDA binding -> chain PAID -> one logical resume event -> callback acknowledged -> agent resumes`

The seeded proof additionally restarts the Gateway after delivery and verifies that the acknowledged resume event is **not** emitted again.

## Deterministic CI proof

Workflow:

`Gateway check`

Run ID:

`36211748985`

Head commit:

`c202a96bca5eb8fdf7127107df019431296ea55b`

Result:

- `npm ci`: PASS
- `npm test`: **48/48 PASS**
- `npm run demo`: **PASS**

The deterministic suite uses temporary local state, a fake chain adapter, and a local mock agent receiver. It does not require a wallet key, a GitHub deployment secret, or live devnet availability.

## Seeded agent-resume proof

Task ID:

`seeded-agent-blocker`

Observed final state:

- task status: `paid`
- resume state: `delivered`
- callback count before Gateway restart: `1`
- callback count after Gateway restart: `1`
- no duplicate after restart: `true`

Stable event ID:

`4deaf25af94d670a6d27317c6e128e5f8eff0779aabbe41fa22df19a1e3595a5`

Stable idempotency key:

`ground-relay:seeded-agent-blocker:paid:seeded-settlement-signature`

Seeded evidence hash:

`abababababababababababababababababababababababababababababababab`

The callback payload type is:

`ground_relay.task.paid`

## Durable persistence proof

`gateway/store.mjs` stores a versioned envelope:

```json
{
  "schemaVersion": 1,
  "tasks": {},
  "idempotency": {}
}
```

The implementation:

- writes through a same-directory temporary file;
- flushes/closes the temporary file;
- atomically renames it over the canonical state file;
- serializes mutations through an in-process queue;
- rejects corrupt JSON and unsupported schema versions without replacing the bad source file;
- persists task, idempotency, settlement, and callback retry metadata across restart.

Default runtime state path:

`gateway/data/state.json`

Runtime state is excluded from git.

## Non-custodial chain binding

The Gateway does not sign `post_task`, `claim_task`, `accept_task`, or payout transactions and does not store private keys.

A logical agent task is separately bound through:

`PUT /v1/tasks/{taskId}/chain-binding`

A new binding is accepted only after the chain adapter reads the candidate PDA and validates the expected Ground Relay identity. The implementation rejects:

- wrong cluster;
- wrong program ID;
- wrong account owner;
- wrong Anchor discriminator/layout/status byte;
- poster mismatch;
- reward mint mismatch;
- reward amount mismatch;
- reuse of the same task PDA by a different external task ID;
- a conflicting replacement after a successful binding.

Exact repeated binding is idempotent.

Controlled Ground Relay devnet program ID:

`6v2peeoZVj2AXfczVLqyMUTHYt3XQPqAxCktpTwjUZap`

## Authoritative synchronization

Bound tasks use:

`POST /v1/tasks/{taskId}/sync`

The Solana task account is authoritative for worker, status, evidence hash, mint, and reward. The Gateway rejects identity mismatch rather than silently overwriting trusted binding data.

A stale chain read cannot regress a later local observed lifecycle state. `paid` and `cancelled` are terminal locally.

Legacy local claim/delivery/verify routes remain available only for unbound protocol demos. A bound task rejects those mutations with:

`chain_authoritative`

## Verified settlement semantics

`POST /v1/tasks/{taskId}/paid` no longer means "trust this client and mark the task paid."

It means:

1. compare the candidate settlement signature with any already accepted one;
2. read the bound Solana task account;
3. require authoritative `paid` status;
4. require task/poster/mint/reward identity to remain consistent;
5. persist the accepted settlement signature;
6. create or reuse one logical resume event;
7. attempt callback delivery unless that event is already acknowledged.

An unpaid task returns `settlement_not_confirmed` and no resume event is created.

The same accepted settlement signature is idempotent. A different signature after acceptance returns `settlement_conflict`.

## Resume event semantics

The event identity is deterministic:

`Idempotency-Key: ground-relay:{taskId}:paid:{settlementSignature}`

`eventId = lowercase SHA-256(idempotency-key)`

Delivery semantics are deliberately described as:

**exactly one logical resume event, at-least-once HTTP transport until acknowledgement**

Ground Relay does not claim exactly-once HTTP delivery, because a network failure can be ambiguous without receiver cooperation.

A `2xx` response acknowledges the event permanently. After acknowledgement, automatic startup recovery and repeated paid notifications do not resend it.

## Retry and restart behavior

Retryable conditions:

- network/timeout failure;
- HTTP `408`;
- HTTP `425`;
- HTTP `429`;
- HTTP `5xx`.

Automatic backoff after the immediate attempt:

- +1 second
- +2 seconds
- +4 seconds
- +8 seconds
- +16 seconds

There are at most five automatic retries after the initial attempt.

Each retryable failure persists its attempt metadata and `nextAttemptAt` before relying on an in-memory timer. On restart:

- delivered events are ignored;
- future retries are rescheduled for the stored time;
- overdue retries are scheduled immediately;
- exhausted retries remain persisted but unscheduled;
- terminal failures are not automatically retried.

Manual retry endpoint:

`POST /v1/tasks/{taskId}/resume/retry`

Manual retry preserves the same event ID/idempotency key and resets only the automatic retry budget for that existing event.

## HTTP/API proof

The refactored HTTP server no longer owns an independent in-memory task map. It is transport over the durable service.

M7 tested routes:

- `POST /v1/tasks`
- `GET /v1/tasks/{taskId}`
- `PUT /v1/tasks/{taskId}/chain-binding`
- `POST /v1/tasks/{taskId}/sync`
- `POST /v1/tasks/{taskId}/paid`
- `POST /v1/tasks/{taskId}/resume/retry`
- legacy unbound `claim`, `deliveries`, and `verify` routes

`POST /v1/tasks` requires a callback URL and supports optional `Idempotency-Key` request semantics. Malformed JSON and stable domain errors are mapped to tested HTTP status codes.

Machine-readable contract:

`docs/openapi.yaml`

## Security boundary

M7 introduces no custodial signer.

The Gateway persists only public/task protocol metadata such as:

- public identities/addresses;
- public transaction signatures;
- task/PDA mapping;
- reward identity and amount;
- evidence hash;
- callback URL;
- resume event/retry metadata.

It does **not** persist:

- private keys;
- seed phrases;
- wallet secrets;
- GitHub deployment secrets.

Raw photo/video evidence remains outside the Gateway; only evidence hashes are relevant to the protocol state.

## What remains for M8

M7 proves the agent-resume core thesis but is intentionally a single-process reference service with local JSON persistence.

M8 should focus on product hardening, including:

- real task inbox/history UX;
- app restart/state restoration;
- stronger callback/SSRF deployment policy;
- broader security/privacy review;
- account/vault rent reclamation policy;
- removal or explicit labeling of remaining demo-only values;
- fresh-device/final-release repeatability.

No mainnet deployment is authorized by this checkpoint.
