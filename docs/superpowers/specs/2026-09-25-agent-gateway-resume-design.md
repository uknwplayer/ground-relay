# M7 Agent Gateway and Resume Loop — Design Specification

**Date:** 2026-09-25  
**Project:** Ground Relay  
**Milestone:** M7 — Agent Gateway and resume loop

## 1. Purpose

M7 turns the existing in-memory Agent Gateway prototype into a restart-safe, non-custodial bridge between an autonomous agent and the proven Ground Relay escrow lifecycle.

Target loop:

`agent blocked -> task created -> on-chain task bound -> human completes task -> chain reaches PAID -> gateway delivers resume callback -> agent resumes`

The Gateway observes, persists, correlates, synchronizes, and delivers callbacks. It never signs settlement transactions and never stores wallet secrets.

## 2. Success criteria

M7 is complete when the repository can reproducibly prove all of the following:

1. An external task ID is durably mapped to a Solana task PDA and `post_task` signature.
2. Gateway state survives process restart without an external database or paid service.
3. Bound task status is reconciled against authoritative Solana devnet state.
4. Create, bind, sync, settlement notification, and callback retry behavior is idempotent where required.
5. One accepted PAID settlement creates one logical resume event.
6. Callback delivery failures are persisted and retried without losing state or resending an already acknowledged event.
7. A deterministic local demo proves `agent blocked -> human task -> paid -> agent resumed`.
8. No private key, seed phrase, wallet secret, deployment secret, or custodial signer is introduced into the Gateway.

## 3. Non-goals

M7 does not provide production-scale distributed persistence, multi-region queues, user authentication, hosted infrastructure, mainnet deployment, or a general-purpose marketplace.

Explicitly deferred:

- PostgreSQL, Redis, hosted queues, and other external infrastructure.
- Custodial posting or payout signing inside the Gateway.
- Multi-process/multi-replica coordination.
- Production webhook signing/key management.
- Final mobile task inbox and receipt/history UX.
- Account/vault rent reclamation policy.
- Mainnet settlement.

## 4. Existing starting point

The repository already contains `gateway/server.mjs`, `gateway/server.test.mjs`, and a Gateway CI workflow.

The current prototype supports:

- `POST /v1/tasks`
- `GET /v1/tasks/{taskId}`
- claim
- evidence delivery
- verifier acceptance
- paid transition
- a resume payload returned by the paid route

Its source of truth is an in-memory `Map`, so restart loses state. The paid route constructs a resume object but does not deliver it to the originating agent.

## 5. Architectural decision

### 5.1 Non-custodial Gateway

The Gateway MUST NOT own, reconstruct, receive, or persist poster or worker private keys.

Signing remains in the existing controlled workflow, physical wallet, or another explicitly authorized signer outside this service.

The Gateway owns four concerns only:

1. durable protocol metadata;
2. external task ID ↔ on-chain task binding;
3. authoritative chain synchronization;
4. idempotent resume callback delivery.

### 5.2 Local durable store

The M7 reference implementation uses a versioned JSON state file.

Default:

`gateway/data/state.json`

The path is configurable through an environment variable so tests can use isolated temporary directories.

Writes use atomic replacement:

1. serialize complete next state;
2. write a temporary file in the same directory;
3. flush and close it;
4. rename it over the canonical state file.

A partially written file is never accepted as a successful commit.

`gateway/data/` is runtime state and must be gitignored. Demo fixtures live in tests or explicit immutable fixture files.

### 5.3 Consistency model

M7 is intentionally a **single-process reference service**. Store mutations are serialized inside the process.

Multi-replica locking and distributed consensus are out of scope and must not be implied by documentation.

## 6. Component boundaries

### `gateway/store.mjs`

Purpose: durable state persistence.

Responsibilities:

- initialize empty versioned state;
- load and validate persisted state;
- expose task/idempotency mutation primitives;
- serialize writes;
- perform atomic file replacement;
- persist callback attempt and retry metadata.

Must not call Solana RPC, send callbacks, or decode Anchor accounts.

### `gateway/chain.mjs`

Purpose: authoritative Ground Relay task-state adapter.

Responsibilities:

- read a configured task PDA;
- decode the Ground Relay Anchor account;
- verify program ownership/binding identity;
- normalize chain status;
- return worker, mint, reward, evidence hash, and status.

Must not mutate the store or sign transactions.

Tests inject a fake chain adapter; deterministic CI does not depend on devnet.

### `gateway/callbacks.mjs`

Purpose: resume callback transport.

Responsibilities:

- validate callback URL policy;
- build the canonical resume payload;
- send HTTP POST;
- attach stable idempotency metadata;
- classify response/failure as delivered, retryable, or terminal.

Must not decide whether a task is paid and must not mutate chain state.

### `gateway/service.mjs`

Purpose: domain orchestration.

Responsibilities:

- create logical agent tasks;
- bind tasks to chain identities;
- synchronize authoritative state;
- enforce monotonic/terminal task rules;
- enforce idempotency;
- create exactly one logical resume event for an accepted settlement;
- persist callback attempts/results;
- schedule and execute safe retries.

This is the primary unit-test boundary.

### `gateway/server.mjs`

Purpose: HTTP transport only.

Responsibilities:

- parse and validate requests;
- invoke service operations;
- map domain errors to HTTP responses.

The current state-machine logic moves out of `server.mjs`; M7 must not keep a second in-memory source of truth.

## 7. Durable data model

Top-level state is versioned:

```json
{
  "schemaVersion": 1,
  "tasks": {},
  "idempotency": {}
}
```

Each task persists the logical task plus optional chain and resume state:

```json
{
  "id": "external-task-id",
  "title": "Verify a storefront sign",
  "description": "...",
  "poster": "...",
  "worker": "...",
  "rewardAtomic": "1000000",
  "rewardMint": "So111...",
  "criteria": [],
  "callbackUrl": "http://127.0.0.1:9999/resume",
  "status": "open",
  "createdAt": "...",
  "expiresAt": "...",
  "chain": {
    "cluster": "devnet",
    "programId": "6v2p...",
    "taskPda": "...",
    "postSignature": "...",
    "boundAt": "...",
    "lastSyncedAt": "..."
  },
  "evidenceHash": "...",
  "settlementSignature": "...",
  "resume": {
    "eventId": "...",
    "idempotencyKey": "ground-relay:external-task-id:paid:settlement-signature",
    "state": "pending",
    "attempts": 0,
    "nextAttemptAt": "...",
    "lastAttemptAt": "...",
    "deliveredAt": "...",
    "lastStatusCode": 200,
    "lastError": "...",
    "paidAtObserved": "..."
  }
}
```

Optional values are omitted when absent; empty strings are not used as fake values.

## 8. Task creation and idempotency

`POST /v1/tasks` becomes durable.

For M7 Agent Gateway tasks, `callbackUrl` is required. This is an intentional contract tightening because the purpose of this service is to resume an originating agent after settlement.

The route optionally accepts an `Idempotency-Key` header.

Rules:

- first valid request stores a canonical request hash and resulting task;
- same key + same canonical request returns the original task without duplication;
- same key + different request returns `409 idempotency_conflict`;
- without a key, the existing explicit task-ID uniqueness rule remains;
- idempotency records survive restart.

Callback URL validation rejects non-HTTP(S) schemes. Loopback HTTP is allowed in development/test mode so the seeded demo can run locally.

## 9. External task ID to on-chain binding

Logical creation and on-chain posting are separate because the Gateway is non-custodial.

Add:

`PUT /v1/tasks/{taskId}/chain-binding`

Request:

- `cluster` — exactly `devnet` in M7;
- `programId` — must equal the configured Ground Relay program ID;
- `taskPda`;
- `postSignature`.

Rules:

- the exact same binding may be submitted repeatedly and returns success;
- a different PDA/signature after a successful binding returns `409 binding_conflict`;
- supplied status is never trusted;
- the Gateway reads the task PDA before committing a new binding;
- a failed validation does not persist the candidate binding;
- the chain account must belong to the configured program and match logical poster/mint/reward identity where comparable.

## 10. Authoritative chain synchronization

Add:

`POST /v1/tasks/{taskId}/sync`

Rules:

- unbound task -> `409 task_not_bound`;
- chain account is authoritative for worker, status, evidence hash, mint, and reward amount;
- binding/reward identity mismatch -> `409 chain_mismatch` without overwriting the trusted local binding;
- RPC failure -> `503 chain_unavailable` without inventing a state transition;
- `paid` and `cancelled` are terminal;
- local state never moves backward because of stale cached state;
- after chain `paid`, the service may create/continue the resume event.

For bound tasks, legacy local claim/delivery/verify routes are not allowed to invent authoritative chain transitions. If retained for unbound protocol demos, they must reject mutation of a bound task with `409 chain_authoritative` unless their action is backed by a matching chain synchronization.

## 11. Settlement notification semantics

Retain:

`POST /v1/tasks/{taskId}/paid`

Its meaning changes from "mark paid" to "notify/reconcile a candidate settlement and attempt agent resume".

Request:

- `signature` — required settlement signature.

Behavior:

1. compare the candidate against an already accepted settlement signature, if any;
2. synchronize the bound task from chain;
3. require authoritative chain status `paid`;
4. require task/worker identity to match the binding;
5. only then persist the settlement signature;
6. create or reuse the single logical resume event;
7. attempt callback delivery unless already acknowledged.

A candidate signature is not persisted as accepted settlement before successful chain confirmation.

If chain status is not `paid`, return `409 settlement_not_confirmed` and emit no resume event.

Same signature repeated is idempotent. A different signature after one has been accepted returns `409 settlement_conflict`.

## 12. Resume event identity

Canonical payload:

```json
{
  "type": "ground_relay.task.paid",
  "eventId": "stable-event-id",
  "taskId": "external-task-id",
  "status": "paid",
  "taskPda": "...",
  "evidenceHash": "...",
  "settlementSignature": "...",
  "worker": "...",
  "rewardAtomic": "1000000",
  "rewardMint": "...",
  "paidAtObserved": "..."
}
```

Stable transport key:

`Idempotency-Key: ground-relay:{taskId}:paid:{settlementSignature}`

`eventId` is the lowercase hex SHA-256 of that idempotency-key string. `paidAtObserved` is set once when the confirmed settlement first creates the event and is persisted unchanged across retries.

Delivery semantics are explicitly:

**exactly one logical resume event, at-least-once HTTP transport until acknowledgement**.

The repository must not claim exactly-once HTTP delivery. Network ambiguity makes that impossible without receiver cooperation.

## 13. Callback acknowledgement and retry policy

A callback is acknowledged by any HTTP `2xx` response.

Classification:

- `2xx` -> `delivered`;
- connection error, timeout, `408`, `425`, `429`, `5xx` -> `retryable_failure`;
- other `4xx` -> `terminal_failure` for automatic retry.

Retry schedule after the immediate attempt:

- +1 second;
- +2 seconds;
- +4 seconds;
- +8 seconds;
- +16 seconds.

That is one initial attempt plus at most five automatic retries.

After each retryable failure, the store persists `attempts`, `lastAttemptAt`, failure metadata, and `nextAttemptAt` **before** relying on an in-memory timer.

On process startup, the service scans persisted resume events:

- `delivered` -> never resend;
- `retryable_failure`/`pending` with future `nextAttemptAt` -> schedule for that time;
- overdue retryable event -> schedule an immediate retry;
- exhausted automatic retries -> leave persisted and require explicit retry;
- `terminal_failure` -> no automatic retry.

This makes restart behavior deterministic and prevents retry state from living only in memory.

Timing is injectable in tests so CI does not wait for real backoff delays.

### Manual retry

Add:

`POST /v1/tasks/{taskId}/resume/retry`

Rules:

- task must be authoritatively `paid`;
- an undelivered resume event must exist;
- delivered event returns success without resending;
- the same event ID and idempotency key are always reused;
- manual retry resets only the automatic retry budget for that existing event, not its identity.

## 14. Error model

Stable machine-readable domain codes include:

- `task_not_found`
- `task_exists`
- `invalid_task`
- `task_not_bound`
- `binding_conflict`
- `chain_authoritative`
- `chain_mismatch`
- `chain_unavailable`
- `settlement_not_confirmed`
- `settlement_conflict`
- `idempotency_conflict`
- `callback_not_configured`
- `resume_not_ready`
- `callback_retry_exhausted`

Transport/RPC failures must not corrupt durable state. A state transition is committed only after the service has enough authoritative information to justify it.

`callback_not_configured` exists for migrated/legacy records; newly created M7 agent tasks require a callback URL.

## 15. Security and trust boundaries

### Wallet custody

Persist only public addresses, public transaction signatures, task metadata, callback URL, hashes, and callback delivery metadata. Never persist signing secrets.

### Blockchain authority

Client-provided `paid`, worker, mint, reward, or evidence state is not authoritative after binding. Chain synchronization is authoritative.

### Callback URL policy

Reject non-HTTP(S) schemes. Centralize URL validation in the callback component so production SSRF policy can later be strengthened without changing service semantics.

Loopback HTTP is permitted only for development/test configuration.

### Evidence privacy

Persist evidence hashes only. Raw photos/video remain outside the Gateway.

## 16. HTTP API contract

M7 adds or changes:

- `POST /v1/tasks` — durable create; `callbackUrl` required; optional idempotency header.
- `GET /v1/tasks/{taskId}` — durable task status.
- `PUT /v1/tasks/{taskId}/chain-binding` — verified one-time/idempotent binding.
- `POST /v1/tasks/{taskId}/sync` — authoritative chain reconciliation.
- `POST /v1/tasks/{taskId}/paid` — verified settlement notification plus resume attempt.
- `POST /v1/tasks/{taskId}/resume/retry` — explicit retry of existing undelivered event.

Existing claim/delivery/verify routes may remain for an unbound local protocol demo but use the same service/store and cannot maintain an independent in-memory state machine.

`docs/openapi.yaml` is updated after implementation to match the final tested contract.

## 17. Seeded end-to-end demo

The M7 deterministic demo requires no new physical-wallet action and no live devnet dependency.

Sequence:

1. start a mock agent callback receiver;
2. start Gateway using an isolated temporary state file and fake chain adapter;
3. create a blocked agent task;
4. bind it to a fixture PDA/signature;
5. fake chain advances through relevant states and ultimately `paid`;
6. Gateway sync observes `paid`;
7. Gateway creates the stable resume event and POSTs it;
8. mock agent acknowledges it;
9. stop Gateway;
10. restart from the same state file;
11. prove the delivered event is not emitted again.

A separate optional/manual signer-free workflow may exercise real devnet decoding against the deployed Ground Relay program. Deterministic CI must not depend on network availability.

## 18. Testing strategy

### Store tests

- initialize empty store;
- atomic persistence/reload;
- serialized concurrent mutations;
- corrupt or unsupported schema rejection;
- idempotency persistence;
- callback retry metadata persistence.

### Service tests

- durable create;
- same idempotency key + same request;
- same key + different request conflict;
- exact repeated binding;
- conflicting binding;
- failed binding validation is not persisted;
- unbound sync;
- chain mismatch without corruption;
- authoritative state sync;
- bound local transition rejection;
- settlement rejected unless chain is paid;
- same settlement idempotency;
- settlement conflict;
- one logical resume event;
- delivered callback is not resent;
- retryable failure persistence;
- restart reschedules pending retry;
- manual retry preserves event identity;
- restart preserves task/binding/idempotency state.

### Callback tests

- stable event payload;
- deterministic event ID;
- stable idempotency header;
- 2xx acknowledgement;
- network/408/425/429/5xx retry classification;
- other 4xx terminal classification;
- retry limit.

### HTTP tests

- validation and domain-to-status mapping;
- durable GET after restart;
- binding/sync/paid/retry routes;
- callback URL requirement and scheme validation.

### Seeded demo test

Required path:

`blocked -> created -> bound -> chain paid -> callback acknowledged -> restart -> no duplicate callback`

## 19. CI

The existing Gateway workflow remains the deterministic M7 gate and runs all Gateway tests with temporary state and fake chain adapters.

An optional/manual signer-free devnet check may validate real account decoding without private keys.

No Gateway CI test requires a worker wallet secret or poster signing key.

## 20. Migration from the prototype

Implementation order:

1. add failing tests for persistence/idempotency/restart behavior;
2. add durable store;
3. move domain logic out of `server.mjs` into `service.mjs`;
4. add chain adapter interface and fake adapter;
5. add verified binding and sync;
6. add callback transport/event identity;
7. add persisted retry scheduler/startup recovery;
8. harden `paid` around authoritative chain confirmation;
9. add seeded end-to-end restart demo;
10. update OpenAPI, README, roadmap, and checkpoint evidence.

Correctness takes precedence over undocumented in-memory behavior.

## 21. Definition of done

M7 is done when:

- durable state survives restart;
- external task ID ↔ task PDA binding is implemented and conflict-safe;
- chain synchronization is authoritative;
- a client cannot mark an unpaid task paid;
- one logical resume event exists per accepted settlement;
- callback retries reuse one deterministic event ID/idempotency key;
- retry state survives restart;
- acknowledged callbacks are not resent after restart;
- failed callbacks remain inspectable and manually retryable;
- deterministic CI proves the full seeded resume loop;
- Gateway contains no private signing material;
- API/project documentation matches tested behavior.

After this, M8 can focus on product hardening with the core thesis proven end to end:

`agent blocked -> funded task -> human work -> verified settlement -> agent resumed`
