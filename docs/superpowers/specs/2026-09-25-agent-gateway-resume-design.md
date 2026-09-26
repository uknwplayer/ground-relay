# M7 Agent Gateway and Resume Loop — Design Specification

**Date:** 2026-09-25  
**Project:** Ground Relay  
**Milestone:** M7 — Agent Gateway and resume loop

## 1. Purpose

M7 turns the existing in-memory Agent Gateway prototype into a credible, restart-safe bridge between an autonomous agent and the already-proven Ground Relay escrow lifecycle.

The target product loop is:

`agent blocked -> task created -> on-chain task bound -> human completes task -> chain reaches PAID -> gateway delivers resume callback -> agent resumes`

The design deliberately avoids making the Gateway a custodian of wallet secrets or settlement funds. The Gateway observes, persists, correlates, and delivers callbacks; signing remains outside the Gateway.

## 2. Success criteria

M7 is complete when the repository can reproducibly demonstrate all of the following:

1. An external agent task ID is durably mapped to a Solana task PDA and posting signature.
2. Gateway state survives process restart without an external database or paid infrastructure.
3. Gateway status can be reconciled against authoritative Solana devnet task state.
4. Repeated create, bind, sync, paid, and callback operations are idempotent where the protocol requires idempotency.
5. A PAID task produces one logical resume event, even if settlement notification or callback delivery is retried.
6. Callback delivery failures are persisted and can be retried without losing state or duplicating an already acknowledged callback.
7. A seeded automated demo proves `agent blocked -> human task -> paid -> agent resumed` using the Gateway and a local mock agent receiver.
8. No private keys, seed phrases, wallet secrets, or deployment secrets are written to Gateway state.

## 3. Non-goals

M7 does not attempt to provide production-scale distributed persistence, multi-region queues, mainnet deployment, user authentication, hosted infrastructure, or a general-purpose job marketplace.

The following are intentionally deferred:

- PostgreSQL, Redis, hosted queues, and other external infrastructure.
- Custodial posting or payout signing inside the Gateway.
- Multi-process concurrency across several Gateway replicas.
- Production webhook signing/key management.
- Final mobile task inbox and receipt/history UX.
- Account/vault rent reclamation policy.
- Mainnet settlement.

## 4. Existing starting point

The current Gateway already exposes a small HTTP state-machine prototype in `gateway/server.mjs` and has tests in `gateway/server.test.mjs`.

Existing behavior includes:

- `POST /v1/tasks`
- `GET /v1/tasks/{taskId}`
- claim transition
- evidence delivery transition
- verifier acceptance transition
- paid transition
- a resume payload returned by the paid route

The current persistence model is an in-memory `Map`, so process restart destroys task state. The existing paid route also constructs a resume payload but does not actually deliver it to the originating agent.

## 5. Architectural decision

### 5.1 Non-custodial Gateway

The Gateway MUST NOT own, reconstruct, receive, or persist any poster or worker private key.

On-chain signing continues to be performed by the existing controlled workflow, mobile wallet, or another explicitly authorized signer outside this service.

The Gateway therefore has four responsibilities:

1. persist protocol metadata;
2. bind external task identifiers to on-chain identifiers;
3. synchronize authoritative task state from Solana;
4. deliver an idempotent resume callback after settlement.

### 5.2 Local durable store

The M7 reference implementation uses one local JSON state file under the Gateway runtime directory.

Default path:

`gateway/data/state.json`

The path MUST be configurable through an environment variable so tests can use isolated temporary files.

Writes MUST use an atomic replace pattern:

1. serialize the complete next state;
2. write it to a temporary file in the same directory;
3. flush/close the file;
4. rename the temporary file over the canonical file.

A partially written state file must never be considered a successful commit.

The runtime `gateway/data/` state is ignored by git. Seed/demo fixtures belong in test files or explicit fixture files, not in mutable runtime state.

### 5.3 Single-process consistency model

The M7 Gateway is a single-process reference service. Writes are serialized inside the process through the store abstraction.

Multi-replica locking is explicitly out of scope. This constraint must be documented so the JSON store is not misrepresented as production-distributed storage.

## 6. Component boundaries

The Gateway should be split so each unit has one clear responsibility.

### `gateway/store.mjs`

Purpose: durable task/event persistence.

Responsibilities:

- initialize an empty store when no state file exists;
- load and validate persisted state;
- expose task lookup and mutation primitives;
- perform atomic writes;
- persist callback-attempt metadata;
- persist idempotency records.

Must not:

- call Solana RPC;
- send HTTP callbacks;
- know Anchor account layout.

### `gateway/chain.mjs`

Purpose: authoritative Ground Relay devnet state adapter.

Responsibilities:

- read the configured task PDA;
- decode the Ground Relay Anchor task account;
- normalize chain status to the Gateway status vocabulary;
- return worker, mint, amount, evidence hash, and status needed for reconciliation.

Must not:

- mutate Gateway persistence directly;
- sign transactions;
- store private keys.

For tests, this component must be replaceable with a fake adapter.

### `gateway/callbacks.mjs`

Purpose: resume callback delivery.

Responsibilities:

- construct the canonical resume event;
- send HTTP POST to the task callback URL;
- attach a stable idempotency key;
- classify success, retryable failure, and terminal configuration error;
- return delivery metadata to the service layer.

Must not:

- change on-chain state;
- decide whether a task is actually paid.

### `gateway/service.mjs`

Purpose: protocol orchestration.

Responsibilities:

- create logical tasks;
- bind tasks to on-chain PDAs;
- synchronize chain state;
- enforce state/idempotency rules;
- decide whether a resume event is eligible;
- persist callback attempt/result state;
- retry a pending callback safely.

This is the main domain boundary and must be directly unit-testable without opening an HTTP port.

### `gateway/server.mjs`

Purpose: HTTP transport only.

Responsibilities:

- parse requests;
- validate transport-level input;
- invoke service methods;
- map domain results/errors to HTTP responses.

The existing monolithic state logic should move out of this file as part of M7 rather than adding more protocol complexity to it.

## 7. Durable data model

The persisted state has a versioned top-level envelope.

Conceptual shape:

```json
{
  "schemaVersion": 1,
  "tasks": {
    "external-task-id": {
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
        "state": "pending|delivered|retryable_failure|terminal_failure",
        "attempts": 0,
        "lastAttemptAt": "...",
        "deliveredAt": "...",
        "lastStatusCode": 200,
        "lastError": "..."
      }
    }
  },
  "idempotency": {}
}
```

Only fields relevant to the task are present. Undefined optional values are omitted rather than serialized as misleading empty strings.

## 8. External task ID to on-chain binding

Creating a logical task and creating its on-chain PDA are separate operations because the Gateway is non-custodial.

A task therefore begins as a logical Gateway record and later receives an explicit binding.

### Binding endpoint

Add:

`PUT /v1/tasks/{taskId}/chain-binding`

Request fields:

- `cluster` — must be `devnet` for M7;
- `programId` — must equal the configured Ground Relay program ID;
- `taskPda`;
- `postSignature`.

Binding rules:

- a task can be bound once;
- submitting the exact same binding again returns success and does not create a duplicate mutation;
- submitting a different PDA/signature after a binding exists returns `409 binding_conflict`;
- binding does not trust the supplied status;
- after binding, the service performs an authoritative chain read before accepting the binding as synchronized.

The chain read must confirm at minimum that the task account belongs to the configured Ground Relay program and that the task's poster/mint/reward data are consistent with the logical record where those fields are comparable.

## 9. Chain synchronization

Add:

`POST /v1/tasks/{taskId}/sync`

The sync route reads the bound task PDA through the chain adapter and persists the resulting authoritative state.

Rules:

- unbound tasks return `409 task_not_bound`;
- Gateway state must never move backward because of stale local data;
- the chain account is authoritative for `worker`, `status`, `evidenceHash`, mint, and reward amount;
- a mismatch that violates the recorded binding or reward identity is surfaced as `409 chain_mismatch` rather than silently overwritten;
- terminal chain states `paid` and `cancelled` remain terminal locally;
- after `paid`, synchronization may make the task eligible for resume delivery.

The HTTP response should include the normalized public task and whether a resume callback is pending, delivered, or failed.

## 10. Settlement notification semantics

The existing `POST /v1/tasks/{taskId}/paid` route is retained for compatibility but changes meaning.

It becomes an explicit settlement-notification/reconciliation trigger, not the authority that unilaterally marks a task paid.

Request:

- `signature` — required settlement transaction signature.

Behavior:

1. store/compare the candidate settlement signature;
2. synchronize the bound task from chain;
3. require authoritative chain status `paid`;
4. require the configured worker/task identity to match;
5. persist the settlement signature;
6. construct or reuse the single logical resume event;
7. attempt callback delivery unless it has already been acknowledged.

If chain status is not `paid`, return a conflict and do not emit a resume event.

Repeated calls with the same signature are idempotent.

A different settlement signature after one has already been accepted returns `409 settlement_conflict` unless a later design explicitly supports replacement.

## 11. Resume event and idempotency

The canonical resume payload is:

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

The request includes:

`Idempotency-Key: ground-relay:{taskId}:paid:{settlementSignature}`

The same logical paid event always uses the same idempotency key and stable `eventId`.

The Gateway defines **exactly-once logical emission, at-least-once transport until acknowledgement**:

- only one resume event record exists for one accepted settlement;
- network retries may send the HTTP request more than once;
- the stable idempotency key lets the receiver safely deduplicate retries;
- after an acknowledged 2xx delivery, the Gateway never automatically sends that event again.

The project documentation must not call this network behavior "exactly once delivery" because HTTP failure ambiguity makes that claim false without cooperation from the receiver.

## 12. Callback acknowledgement and retry policy

A callback attempt is successful when the receiver returns any HTTP `2xx` response.

Classification:

- `2xx` -> `delivered` terminal callback state;
- connection error, timeout, `408`, `425`, `429`, or `5xx` -> `retryable_failure`;
- other `4xx` -> `terminal_failure` for automatic retry purposes.

Retry schedule for the reference implementation:

- attempt 1: immediate;
- retry 1: after 1 second;
- retry 2: after 2 seconds;
- retry 3: after 4 seconds;
- retry 4: after 8 seconds;
- retry 5: after 16 seconds.

After five retries beyond the initial attempt, the event remains persisted as `retryable_failure` and requires an explicit retry trigger. The service must not spin indefinitely in memory.

For deterministic tests, retry timing must be injectable or bypassable.

### Manual retry endpoint

Add:

`POST /v1/tasks/{taskId}/resume/retry`

Rules:

- only a paid task with an existing undelivered resume event is eligible;
- delivered callbacks return success without resending;
- non-paid tasks return `409 resume_not_ready`;
- the same stable event ID and idempotency key are reused.

## 13. Create-task idempotency

`POST /v1/tasks` gains optional support for an `Idempotency-Key` request header.

When provided:

- the first valid request stores a canonical request hash and task result;
- repeating the same key with the same canonical request returns the original task result without creating a second task;
- repeating the same key with a different request returns `409 idempotency_conflict`.

If no key is provided, the existing explicit task-ID uniqueness rule remains in effect.

Idempotency records survive restart in the same durable store.

## 14. Error handling

Domain errors use stable machine-readable codes. M7 must define at least:

- `task_not_found`
- `task_exists`
- `invalid_task`
- `task_not_bound`
- `binding_conflict`
- `chain_mismatch`
- `chain_unavailable`
- `settlement_not_confirmed`
- `settlement_conflict`
- `idempotency_conflict`
- `callback_not_configured`
- `resume_not_ready`
- `callback_retry_exhausted`

Transport failures to Solana RPC or the callback receiver must not corrupt durable task state. The store should commit each state transition only after the service has enough information to make that transition valid.

## 15. Security and trust boundaries

### Wallet custody

The Gateway stores only public addresses, public transaction signatures, task metadata, callback URLs, and delivery metadata. It never stores signing secrets.

### Callback URL scope

For the M7 hackathon reference implementation, callback delivery is intended for explicitly supplied agent endpoints. The implementation must reject non-HTTP(S) schemes.

To keep the local seeded demo possible, loopback HTTP URLs are allowed in development/test mode.

Production-grade SSRF protections and allowlists are deferred, but the code structure must centralize callback URL validation so stronger policy can be added later.

### Blockchain authority

A client-provided `paid` status is never authoritative. Paid eligibility comes from the chain adapter reading the bound Ground Relay account.

### Evidence privacy

The Gateway persists evidence hashes, not raw photos/videos. Existing evidence privacy behavior remains unchanged.

## 16. HTTP API changes

M7 adds or changes these routes:

- `POST /v1/tasks` — durable create; optional idempotency header.
- `GET /v1/tasks/{taskId}` — reads durable task state.
- `PUT /v1/tasks/{taskId}/chain-binding` — one-time idempotent external-ID/PDA binding.
- `POST /v1/tasks/{taskId}/sync` — authoritative Solana reconciliation.
- `POST /v1/tasks/{taskId}/paid` — verified settlement notification plus resume attempt.
- `POST /v1/tasks/{taskId}/resume/retry` — explicit retry of an undelivered paid-event callback.

Existing claim/delivery/verify prototype routes may remain for the local protocol demo during M7, but they must use the new service/store layer if retained. They must not maintain a second independent in-memory source of truth.

`docs/openapi.yaml` must be updated to reflect the final M7 contract after implementation.

## 17. Seeded end-to-end demo

M7 includes an automated local seeded demo that proves the agent-resume concept without requiring a new physical-wallet action.

The demo consists of:

1. a local mock agent receiver starts and records resume events;
2. the Gateway starts with an isolated temporary state file;
3. an agent creates a blocked task with a callback URL;
4. the task is bound to a controlled test/fake chain adapter task PDA;
5. the fake/fixture chain advances through the states needed for the test;
6. the Gateway syncs and observes `paid`;
7. the Gateway posts the resume event;
8. the mock agent acknowledges it;
9. the test restarts the Gateway from the same state file and proves the acknowledged callback is not emitted again.

A separate integration test may exercise real signer-free devnet reads against the already deployed Ground Relay program, but the core CI suite must not depend on devnet availability.

This distinction keeps normal CI deterministic while preserving a path for public-chain verification.

## 18. Testing strategy

### Store tests

- empty initialization;
- atomic persistence and reload;
- corrupt/unsupported schema rejection;
- idempotency record persistence;
- callback attempt persistence.

### Service tests

- create with and without idempotency key;
- repeated same-key/same-body create succeeds idempotently;
- same-key/different-body create conflicts;
- exact repeated chain binding succeeds;
- conflicting binding fails;
- unbound sync fails;
- chain mismatch fails without corrupting local record;
- authoritative state synchronization;
- settlement notification rejected unless chain is `paid`;
- repeated paid notification with same signature is idempotent;
- conflicting settlement signature fails;
- delivered callback is not resent;
- retryable callback failure is persisted;
- explicit retry reuses event ID/idempotency key;
- restart preserves all relevant state.

### Callback tests

- payload is stable;
- idempotency header is stable;
- `2xx` acknowledgement succeeds;
- retryable network/5xx/429 classification;
- terminal 4xx classification;
- retry limit behavior.

### HTTP tests

- route validation and status-code mapping;
- existing public-task representation remains coherent;
- new binding/sync/retry routes.

### Seeded demo test

One test must cover the full logical path:

`blocked -> created -> bound -> chain paid -> callback -> acknowledged -> restart -> no duplicate callback`

## 19. CI

The existing Gateway workflow remains the primary deterministic M7 check.

It should run all Gateway unit/integration tests using temporary state files and fake chain adapters.

A separate optional/manual signer-free devnet workflow may verify chain decoding against the deployed program without introducing private keys.

No CI job should require a worker wallet secret.

## 20. Migration from current prototype

Implementation proceeds incrementally:

1. create tests around durable/idempotent behavior;
2. introduce the store abstraction;
3. move domain transitions from `server.mjs` into the service layer;
4. introduce the chain adapter interface with a fake implementation for tests;
5. add chain binding and sync;
6. introduce callback delivery and retry state;
7. harden `paid` to require authoritative chain confirmation;
8. add restart/idempotency seeded demo coverage;
9. update OpenAPI, README, roadmap, and checkpoint evidence.

Existing endpoints should remain usable during the transition where practical, but correctness takes precedence over preserving undocumented in-memory behavior.

## 21. Definition of done

M7 is done when all of these are true:

- durable task state survives a Gateway restart;
- external task ID to task PDA binding is implemented and guarded against conflict;
- chain synchronization is authoritative and testable through an adapter;
- settlement notification cannot mark an unpaid chain task as paid;
- one logical paid event is created per accepted settlement;
- callback retries reuse a stable event ID and idempotency key;
- an acknowledged resume callback is not resent after restart;
- retry failures remain inspectable and explicitly retryable;
- deterministic CI proves the full seeded agent-resume loop;
- Gateway code contains no private signing material;
- API and project documentation match the implemented behavior.

At that point the project can move to M8 product hardening with the core thesis demonstrated end to end:

`agent blocked -> funded task -> human work -> verified settlement -> agent resumed`
