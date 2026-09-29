# Persistent Memory Versioning + Decision History Design

**Date:** 2026-09-29  
**Branch:** `spike-mcp-memory-status`  
**Stage:** Persistent Memory MCP — post-durability semantic layer  
**Status:** Design approved in chat; implementation not started

## 1. Purpose

The writable MCP spike has already proven durable remote persistence through Cloudflare D1: a fixed synthetic memory survives a Render redeploy and is retrieved by the next process through the same MCP path.

The next step is to move from simple durable storage to a memory model that can preserve revisions, confirmations, supersessions, and AI decision rationale without destroying historical state.

This design adds four operations:

- `memory_revise`
- `memory_confirm`
- `memory_supersede`
- `decision_record`

The core invariant is:

> A memory item is immutable after creation. Changes in meaning are represented by new memory items plus append-only events.

A historical memory ID must therefore always refer to the same original content. The system may report that the item is no longer current, but it must not silently redirect the old ID to a newer memory.

## 2. Goals

This slice must:

1. preserve every existing `memory_items` row unchanged;
2. add an append-only event log for memory history;
3. support revision by creating a new memory rather than mutating the old one;
4. support explicit supersession between two already-existing memories;
5. support non-destructive confirmations;
6. support structured AI decision records including rationale and rejected alternatives;
7. keep `memory_get(oldId)` historically stable;
8. make `memory_search` return only current memories by default;
9. allow audit search with `includeHistory=true`;
10. keep the MCP contract consistent across local SQLite and Cloudflare D1;
11. preserve the already-proven D1 restart durability guarantee;
12. reject ambiguous history graphs such as self-supersession, branching successors, or cycles.

## 3. Non-goals

This slice does not implement:

- automatic conversation ingestion;
- Watcher/Steward scheduling;
- vector embeddings or semantic search;
- confidence scoring;
- automatic contradiction detection;
- deletion/forgetting workflows;
- public/shared multi-user memory;
- permissions/ACLs;
- encrypted personal-memory payloads;
- evidence custody;
- production-grade multi-tenant isolation;
- a complete event-sourcing architecture where the entire memory item itself is reconstructed from events.

The current service remains a spike and must continue to use synthetic test data only.

## 4. Existing state and invariants

The current backend has one table:

```sql
CREATE TABLE memory_items (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL,
  kind TEXT NOT NULL,
  content TEXT NOT NULL,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL
);
```

The current MCP exposes:

- `memory_status`
- `memory_create`
- `memory_get`
- `memory_search`

The same contract works against:

- local Node SQLite;
- Cloudflare D1.

The D1 deployment has already proven that `teste-123` survives a full Render redeploy and is read by a new process before any replacement write occurs.

This slice must not rewrite, migrate, or reinterpret existing `memory_items` rows destructively.

## 5. Architecture decision

Use a hybrid append-only model:

```text
immutable memory_items
        +
append-only memory_events
        ↓
derived current/history state
```

`memory_items` remains the durable content record.

`memory_events` records relationships and historical facts about memory items.

This model is preferred over adding mutable status columns to `memory_items` because it keeps the original memory record stable and makes every semantic change independently auditable.

It is also preferred over full event sourcing because the current spike does not need to reconstruct base memory content from events.

## 6. Event data model

Add one table to both backends:

```sql
CREATE TABLE IF NOT EXISTS memory_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  memory_id TEXT NOT NULL,
  related_memory_id TEXT,
  note TEXT,
  metadata_json TEXT,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CHECK (related_memory_id IS NULL OR related_memory_id <> memory_id)
);
```

Required event types for this slice:

- `revision`
- `confirmation`
- `supersede`
- `decision_recorded`

### 6.1 Field semantics

`id`
: Unique immutable event ID.

`type`
: One of the supported event types above.

`memory_id`
: Primary memory affected by the event.

`related_memory_id`
: Secondary memory for relation events. For `revision` and `supersede`, this is the successor memory ID. It is null for `confirmation` and `decision_recorded`.

`note`
: Optional human-readable reason or confirmation note.

`metadata_json`
: Optional structured metadata encoded as JSON. It must contain only JSON-compatible data and must never be used for secrets.

`source`
: Origin of the event, such as `mcp_revision`, `mcp_confirmation`, `mcp_supersede`, or `mcp_decision_record`.

`created_at`
: Immutable ISO-8601 timestamp.

### 6.2 Successor uniqueness

A memory can have at most one outgoing semantic successor in this version.

Conceptually, the database must enforce the equivalent of:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS memory_events_one_successor
ON memory_events(memory_id)
WHERE type IN ('revision', 'supersede');
```

This intentionally prevents branching history in the first version.

## 7. Derived memory state

The system derives state from `memory_items` plus `memory_events`; it does not persist a mutable `current` flag on the item itself.

A memory is `current=true` when no outgoing event of type `revision` or `supersede` exists for its ID.

A memory is `current=false` when such an outgoing successor event exists.

For a memory item, the derived state may contain:

```json
{
  "current": false,
  "supersededBy": "mem-002",
  "supersessionType": "revision",
  "revisedFrom": null,
  "confirmationCount": 2,
  "lastConfirmedAt": "2026-09-29T12:00:00.000Z"
}
```

For the successor memory, `revisedFrom` or `supersededFrom` can be derived from the incoming relation.

The first implementation should expose only fields that can be derived unambiguously from the event graph.

## 8. History graph rules

To keep the first version deterministic:

1. a memory cannot supersede itself;
2. a memory may have at most one outgoing successor;
3. a successor relationship must not create a cycle;
4. `memory_revise` may only revise a memory that is currently active;
5. `memory_supersede(oldId, newId)` requires both IDs to exist;
6. `oldId` must currently be active;
7. `newId` must currently be active;
8. `oldId` and `newId` must differ;
9. confirmation does not affect current/superseded state;
10. confirmation may target either a current or historical memory because confirming an old historical fact is itself useful audit evidence.

If a caller tries to revise or supersede an already-superseded memory, return a clear `memory_not_current` style error rather than creating a branch.

## 9. MCP operation semantics

### 9.1 `memory_revise`

Purpose: replace the meaning/content of one current memory while preserving the original.

Input:

```json
{
  "id": "mem-001",
  "content": "new content",
  "reason": "optional reason",
  "newId": "optional caller-provided id"
}
```

Behavior:

1. read `mem-001`;
2. fail if it does not exist;
3. derive its state and fail if it is not current;
4. create a new `memory_items` row with a new ID;
5. copy `scope` and `kind` from the original;
6. store the new content;
7. use a revision-specific source such as `mcp_revision`;
8. append a `revision` event from old ID to new ID;
9. return both versions plus the relation.

The original item is never updated.

Conceptual result:

```json
{
  "revised": true,
  "previous": {
    "id": "mem-001",
    "content": "old content"
  },
  "current": {
    "id": "mem-002",
    "content": "new content"
  },
  "relation": {
    "type": "revision",
    "from": "mem-001",
    "to": "mem-002"
  }
}
```

### 9.2 `memory_confirm`

Purpose: record that a memory was checked/confirmed without changing it.

Input:

```json
{
  "id": "mem-002",
  "note": "optional confirmation note"
}
```

Behavior:

1. fail if the memory does not exist;
2. append a `confirmation` event;
3. do not modify the memory item;
4. return the confirmation event plus derived confirmation count/latest time.

Repeated confirmations are valid and append additional events.

### 9.3 `memory_supersede`

Purpose: explicitly state that one already-existing memory replaces another already-existing memory.

Input:

```json
{
  "oldId": "mem-001",
  "newId": "mem-900",
  "reason": "optional reason"
}
```

Behavior:

1. require both IDs to exist;
2. require both IDs to differ;
3. require `oldId` to be current;
4. require `newId` to be current;
5. reject a relation that creates a cycle;
6. append a `supersede` event from old to new;
7. do not alter either `memory_items` row.

This differs from `memory_revise`: `memory_revise` creates the successor; `memory_supersede` links two records that already exist.

### 9.4 `decision_record`

Purpose: persist an AI/user decision together with the reason it was chosen.

Input:

```json
{
  "decision": "Use D1 as the durable backend",
  "rationale": "It preserves SQL-like semantics and survives Render restarts.",
  "alternatives": [
    "Render local SQLite",
    "Render Postgres"
  ],
  "context": "Persistent Memory MCP durability spike",
  "scope": "project:persistent-memory",
  "id": "optional caller-provided id"
}
```

Behavior:

1. create one `memory_items` row with `kind="decision"` and `content=decision`;
2. use the supplied scope or `global` by default;
3. use source `mcp_decision_record`;
4. append one `decision_recorded` event pointing to that memory;
5. encode rationale, alternatives, and optional context in `metadata_json`;
6. return the created decision item and structured decision metadata.

`alternatives` may be omitted or empty.

The rationale must not be hidden in logs; it belongs in durable memory data.

## 10. Existing tool compatibility

The four existing tools remain available.

### 10.1 `memory_create`

Keep its current behavior and response shape.

It creates a new immutable memory item and does not automatically create an event.

### 10.2 `memory_get`

`memory_get(id)` must still return the exact item whose ID was requested.

It must never redirect an old ID to a newer version.

The response may add derived state alongside the existing item:

```json
{
  "found": true,
  "item": {
    "id": "mem-001",
    "scope": "global",
    "kind": "context",
    "content": "old content",
    "source": "mcp_write_spike",
    "createdAt": "..."
  },
  "state": {
    "current": false,
    "supersededBy": "mem-002",
    "supersessionType": "revision"
  }
}
```

This is additive compatibility: existing item fields remain unchanged.

### 10.3 `memory_search`

Add an optional boolean input:

```json
{
  "query": "cloudflare",
  "limit": 5,
  "includeHistory": false
}
```

Default: `includeHistory=false`.

When false:

- search matching memory items;
- suppress items that have an outgoing `revision` or `supersede` event;
- return only current versions.

When true:

- return matching current and historical items;
- include derived state so callers can distinguish them.

A search for content that exists only in a historical version therefore returns zero results by default but can return that version with `includeHistory=true`.

### 10.4 `memory_status`

Keep the existing fields and optionally add an event count:

```json
{
  "records": 12,
  "events": 7
}
```

Adding `events` must not remove or rename existing status fields.

## 11. Backend interface

Both local SQLite and D1 should expose the same higher-level backend methods required by the server.

Expected backend capabilities after this slice:

- `status()`
- `create()`
- `get()`
- `search()`
- `revise()`
- `confirm()`
- `supersede()`
- `recordDecision()`
- `close()`

The implementation may factor event/state helpers internally rather than placing every query directly in the public backend object.

The server should not need to know whether persistence is SQLite or D1.

## 12. SQLite initialization and migration behavior

Local SQLite initialization must:

1. leave the existing `memory_items` table intact;
2. create `memory_events` with `IF NOT EXISTS`;
3. create required indexes with `IF NOT EXISTS`;
4. preserve existing seeded/demo rows;
5. require no destructive migration for old SQLite files.

Reopening an existing database created by the prior spike must succeed without data loss.

## 13. D1 initialization and migration behavior

D1 initialization must:

1. leave the existing remote `memory_items` table intact;
2. create `memory_events` with `IF NOT EXISTS`;
3. create indexes idempotently;
4. preserve all existing rows, including the `teste-123` restart proof;
5. avoid dropping or recreating tables;
6. continue parameterizing user-provided memory values instead of interpolating them into SQL.

The Cloudflare API token remains configuration-only and must never appear in logs, test snapshots, error bodies, memory metadata, or documentation examples as a real value.

## 14. Error behavior

Errors should be concise and deterministic enough for MCP callers to act on.

Required cases include:

- `memory_not_found`
- `memory_not_current`
- `memory_successor_conflict`
- `memory_cycle_detected`
- `memory_same_id`
- duplicate memory ID / event ID conflict
- backend/network failure
- malformed stored decision metadata

Backend implementation details and credentials must not be exposed in returned errors.

For D1, sanitized HTTP-level failure behavior from the current adapter remains required.

## 15. Concurrency and integrity

The first version does not support branching histories.

The database must enforce at most one outgoing `revision`/`supersede` successor per memory using a unique constraint/index where supported.

Application logic must additionally check for cycles before inserting a successor relation.

If two concurrent attempts try to supersede the same memory, at most one may succeed. The loser must receive a conflict-style error rather than creating a second successor.

`memory_revise` consists logically of two writes: the new memory item and the revision event. The implementation plan must preserve atomicity as far as the selected backend allows. It must not leave an externally visible revision relation pointing to a missing memory.

If complete cross-statement transaction semantics differ between local SQLite and the D1 HTTP query API, the implementation plan must choose and document the safest supported approach rather than pretending the guarantees are identical.

## 16. Search semantics

Search remains literal and case-insensitive in this slice.

Searchable fields remain:

- `content`
- `id`
- `scope`
- `kind`

Decision rationale and event notes are not part of ordinary `memory_search` in this slice. Searching event metadata can be added later as a separate feature rather than silently changing the meaning of memory search.

Ordering remains deterministic:

1. `created_at DESC`
2. `id ASC`

The `limit` remains bounded to the current maximum of 20.

## 17. MCP tool set after this slice

A successful server must expose exactly these eight tools:

```text
memory_status
memory_create
memory_get
memory_search
memory_revise
memory_confirm
memory_supersede
decision_record
```

No automatic memory-writing tool is added yet.

## 18. Startup self-test behavior

The existing restart persistence probe must continue to pass.

The semantic-layer implementation should extend testing without turning startup into a growing collection of permanent production-like test records.

Recommended split:

- keep startup remote checks minimal;
- prove detailed revision/confirmation/supersession semantics primarily in automated local/backend tests;
- add one deterministic remote semantic probe only if needed to prove cross-restart event durability.

If a remote semantic probe is added, it must be idempotent and use clearly synthetic IDs/scopes.

## 19. Remote durability acceptance test

Before declaring this slice complete in D1 mode, prove at minimum:

```text
1. create synthetic old memory
2. memory_revise creates a new memory
3. memory_get(oldId) still returns original content
4. old state reports current=false and points to newId
5. memory_get(newId) returns revised content
6. default memory_search returns only the new/current version
7. memory_search(includeHistory=true) can return the old version
8. memory_confirm(newId) appends confirmation without changing content
9. restart/redeploy Render
10. repeat get/search checks
11. revision relationship and confirmation are still present
```

A second synthetic pair should prove `memory_supersede` between two pre-existing memories.

A synthetic `decision_record` should prove that decision, rationale, alternatives, and context survive restart.

Only after those checks pass can this slice claim durable semantic history, not merely durable raw storage.

## 20. Testing requirements

### 20.1 Local SQLite

Tests must prove:

1. old databases open without destructive migration;
2. `memory_events` is created idempotently;
3. revision creates a new item and preserves the original;
4. old ID remains directly readable;
5. default search suppresses superseded records;
6. `includeHistory=true` returns historical matches;
7. confirmation is append-only and repeatable;
8. supersede links two existing memories;
9. self-supersession is rejected;
10. second successor/branching is rejected;
11. a simple cycle attempt is rejected;
12. decision metadata round-trips correctly;
13. close/reopen preserves items and events.

### 20.2 D1 adapter

Mocked D1 tests must prove:

1. schema initialization includes `memory_events` and required indexes;
2. existing `memory_items` initialization remains non-destructive;
3. SQL values remain parameterized;
4. revision/confirmation/supersede/decision queries map correctly;
5. search current/history filtering maps correctly;
6. sanitized errors never expose the API token;
7. successor conflicts map to deterministic errors where possible.

### 20.3 MCP server

Tests/self-tests must prove:

1. `tools/list` exposes exactly eight tools;
2. schemas accept valid arguments and reject invalid arguments;
3. `memory_get` remains exact-ID and non-redirecting;
4. new responses preserve existing fields;
5. all four new tools invoke the same backend contract in SQLite and D1 modes.

## 21. Security and privacy constraints

This remains a synthetic-data spike.

Do not store:

- passwords;
- API tokens;
- private keys;
- seed phrases;
- authentication cookies;
- private personal-history data;
- sensitive raw conversation exports.

`metadata_json` is not a secret store.

Logs may report synthetic IDs, booleans, counts, backend name, and persistence mode, but should not dump arbitrary memory content or decision rationale by default.

## 22. Expected code boundaries

Likely implementation areas:

- `mcp-spike/memory-backend.js`
  - local event schema, state derivation, and semantic writes;
- `mcp-spike/d1-memory-backend.js`
  - D1 event schema, state derivation, and semantic writes;
- `mcp-spike/memory-backend-factory.js`
  - preserve backend selection, minimal changes only if interface validation is added;
- `mcp-spike/server.js`
  - register four new MCP tools and additive search/get/status behavior;
- `mcp-spike/*.test.js`
  - TDD coverage for semantic history and compatibility;
- `mcp-spike/README.md`
  - document the eight-tool contract and append-only semantics.

If shared state-derivation logic becomes duplicated between SQLite and D1, introduce one focused helper module. Do not perform unrelated refactoring.

## 23. Compatibility rules

The implementation must preserve all of these:

- D1 remains optional and selected by `MEMORY_BACKEND=d1`;
- SQLite remains the default local backend;
- the current D1 environment-variable names do not change;
- `memory_create` remains available;
- `memory_get` keeps exact-ID behavior;
- existing item field names remain unchanged;
- the fixed `teste-123` record is not deleted or rewritten;
- existing `memory_items` rows require no conversion;
- Render restart durability remains demonstrably true.

## 24. Success criteria

This design is implemented successfully when:

1. both backends support the same eight MCP tools;
2. all existing raw-memory tests continue to pass;
3. new semantic tests pass;
4. a revision never mutates the old memory item;
5. exact old-ID reads remain historically stable;
6. default search resolves toward current knowledge without erasing history;
7. audit search can recover old versions;
8. confirmation history is durable;
9. explicit supersession is durable;
10. decision rationale is durable;
11. invalid history graphs are rejected;
12. D1 survives redeploy with both memory items and semantic events intact;
13. no real secret or personal data is introduced during verification.

## 25. Deferred next layer

After this semantic layer is proven, the next architectural work can safely address automatic memory selection:

```text
conversation source
        ↓
Watcher / Steward
        ↓
selection + classification
        ↓
memory_create / memory_revise / memory_confirm / decision_record
        ↓
append-only durable memory history
```

That automatic layer is intentionally deferred until the manual MCP memory semantics are stable and auditable.
