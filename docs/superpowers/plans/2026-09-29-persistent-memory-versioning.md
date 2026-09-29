# Persistent Memory Versioning + Decision History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add immutable revision history, confirmations, explicit supersession, and durable decision rationale to the existing writable MCP memory spike without breaking the proven D1 restart persistence path.

**Architecture:** Keep `memory_items` immutable and add append-only `memory_events`. Both SQLite and Cloudflare D1 expose the same semantic backend contract; `memory_get` remains exact-ID, while `memory_search` filters historical items by default. Multi-write semantic operations use transactions: `BEGIN IMMEDIATE/COMMIT/ROLLBACK` locally and a single D1 REST `batch` request remotely.

**Tech Stack:** Node.js 22+, built-in `node:sqlite`, built-in `fetch`, Cloudflare D1 REST API, MCP SDK, Zod, `node:test`.

**Spec:** `docs/superpowers/specs/2026-09-29-persistent-memory-versioning-design.md`

## Global Constraints

- `memory_items` rows are immutable after creation.
- Add `memory_events` append-only; never rewrite existing `memory_items` rows.
- Preserve the existing D1 environment variable names and `MEMORY_BACKEND=d1` selection.
- Preserve `memory_create` response fields and exact-ID semantics for `memory_get`.
- `memory_search` defaults to current memories only; `includeHistory=true` enables historical matches.
- Reject self-supersession, a second outgoing successor, and cycles.
- Keep `teste-123` untouched and keep the existing restart probe working.
- Use only synthetic data in tests and remote verification.
- Never expose the Cloudflare API token in logs, errors, fixtures, metadata, or documentation.
- Node engine remains `>=22.5`; do not add a database dependency.

## Review Focus

- A duplicate caller-provided `newId` during revision must fail without leaving either a new item or relation behind.
- Two successor attempts for the same memory must yield exactly one success and one deterministic conflict, never a branch.
- A cycle attempt such as `A -> B` followed by `B -> A` must be rejected before an event becomes visible.
- Malformed `decision_recorded.metadata_json` must produce a deterministic sanitized error when read, not crash or silently discard rationale.
- Old SQLite files and the live D1 schema containing only `memory_items` must initialize non-destructively and preserve all prior rows.

---

### Task 1: Shared semantic state and error helpers

**Files:**
- Create: `mcp-spike/memory-semantics.js`
- Create: `mcp-spike/memory-semantics.test.js`

**Interfaces:**
- Produces: `semanticError(code, message?) -> Error` with stable `.code`.
- Produces: `deriveMemoryState({ outgoing, incoming, confirmations, decisionEvent }) -> object`.
- Produces: `wouldCreateCycle(edges, fromId, toId) -> boolean` for single-successor graphs.
- Produces: `parseDecisionMetadata(raw) -> { rationale, alternatives, context? } | null`, throwing code `memory_metadata_invalid` on malformed stored JSON.

- [ ] **Step 1: Write failing tests** named `derive state marks outgoing successor as historical`, `cycle detection follows successor chain`, `malformed decision metadata is deterministic`, and `multiple incoming predecessors do not invent a single revisedFrom`.
- [ ] **Step 2: Run** `cd mcp-spike && node --test memory-semantics.test.js` and verify RED because the helper module does not exist.
- [ ] **Step 3: Implement** the four exported helpers with no database access and no logging.
- [ ] **Step 4: Run** `cd mcp-spike && node --test memory-semantics.test.js` and require zero failures.
- [ ] **Step 5: Commit** with `git commit -m "feat: add memory semantic helpers"`.

### Task 2: SQLite append-only event model and semantic operations

**Files:**
- Modify: `mcp-spike/memory-backend.js`
- Modify: `mcp-spike/memory-backend.test.js`
- Consume: `mcp-spike/memory-semantics.js`

**Interfaces:**
- `status() -> { backend, records, events, writable, persistence }`.
- `create(input) -> MemoryItem` remains item-only.
- `get(id) -> { item, state } | null`.
- `search(query, limit=5, includeHistory=false) -> Array<{ item, state }>`.
- `revise({ id, content, reason?, newId? }) -> { revised, previous, current, relation }`.
- `confirm({ id, note? }) -> { confirmed, item, event, confirmationCount, lastConfirmedAt }`.
- `supersede({ oldId, newId, reason? }) -> { superseded, previous, current, relation }`.
- `recordDecision({ decision, rationale, alternatives?, context?, scope?, id? }) -> { recorded, item, event, decision }`.

- [ ] **Step 1: Add failing migration tests** proving an old database containing only `memory_items` reopens, keeps its row, creates `memory_events`, and can initialize twice.
- [ ] **Step 2: Run** `cd mcp-spike && node --test memory-backend.test.js` and verify RED on missing events/schema behavior.
- [ ] **Step 3: Implement** `memory_events` plus the partial unique index on outgoing `revision`/`supersede` events using `IF NOT EXISTS`; do not alter `memory_items`.
- [ ] **Step 4: Add failing revision/search tests** proving old content remains readable by exact ID, old state becomes `current=false`, default search hides it, and `includeHistory=true` returns it.
- [ ] **Step 5: Implement** exact-ID descriptors and current/history search filtering; preserve deterministic `created_at DESC, id ASC` ordering and limit `1..20`.
- [ ] **Step 6: Add failing confirmation/supersede tests** covering repeated confirmation, historical confirmation, self-supersession, second successor conflict, and simple cycle rejection.
- [ ] **Step 7: Implement** `confirm()` and `supersede()`. Use `BEGIN IMMEDIATE`, and on any failure `ROLLBACK`; use the unique index as the final concurrency guard.
- [ ] **Step 8: Add failing decision tests** proving `kind="decision"`, `content=decision`, rationale/alternatives/context round-trip, malformed metadata error, and no item/event partial write.
- [ ] **Step 9: Implement** `revise()` and `recordDecision()` as atomic SQLite transactions; generate item/event IDs before transaction start and re-read descriptors only after commit.
- [ ] **Step 10: Add close/reopen test** proving items, events, successor state, confirmations, and decision metadata persist in the same SQLite file.
- [ ] **Step 11: Run** `cd mcp-spike && node --test memory-backend.test.js memory-semantics.test.js` and require zero failures.
- [ ] **Step 12: Commit** with `git commit -m "feat: add append-only SQLite memory history"`.

### Task 3: D1 schema, batching, and semantic backend parity

**Files:**
- Modify: `mcp-spike/d1-memory-backend.js`
- Modify: `mcp-spike/d1-memory-backend.test.js`
- Consume: `mcp-spike/memory-semantics.js`

**Interfaces:**
- Preserve `createD1MemoryBackend({ accountId, databaseId, apiToken, apiBaseUrl?, fetchImpl? })`.
- Add internal `queryBatch(statements)` where each statement is `{ sql, params }`; send one REST body `{ batch: [...] }` to the existing `/query` endpoint.
- Public backend methods and result shapes must match Task 2.

- [ ] **Step 1: Add failing init tests** asserting D1 initialization creates `memory_items`, `memory_events`, and the successor index idempotently without `DROP` or destructive migration.
- [ ] **Step 2: Add failing batch tests** asserting one request body contains `batch`, each user value is in `params`, and any failed result rejects with a sanitized error that excludes the API token.
- [ ] **Step 3: Implement** `queryBatch(statements)` and multi-result envelope validation while retaining the current single-query helper.
- [ ] **Step 4: Add failing semantic mapping tests** for revision, confirmation, supersession, current/history search, event count, and decision metadata.
- [ ] **Step 5: Implement** D1 semantic methods using the same result shapes as SQLite. Encode write preconditions into SQL where practical and use the partial unique index as the authoritative second-successor guard.
- [ ] **Step 6: For `revise()` and `recordDecision()`, use one D1 batch** for item + event writes so a statement failure aborts/rolls back the batch; for successor insertion, re-check current/cycle state immediately before the batched write and translate uniqueness/precondition failure to stable semantic error codes.
- [ ] **Step 7: Add tests** for duplicate `newId`, successor conflict, cycle attempt, malformed metadata, and secret redaction.
- [ ] **Step 8: Run** `cd mcp-spike && node --test d1-memory-backend.test.js memory-semantics.test.js` and require zero failures.
- [ ] **Step 9: Commit** with `git commit -m "feat: add durable D1 semantic memory history"`.

### Task 4: Factory parity and backend contract regression

**Files:**
- Modify: `mcp-spike/memory-backend-factory.test.js`
- Modify only if needed: `mcp-spike/memory-backend-factory.js`

**Interfaces:**
- `createMemoryBackendFromEnv(env, options)` continues returning either the local backend or initialized D1 backend with the Task 2/3 public methods.

- [ ] **Step 1: Add failing parity assertions** that both selected backends expose `status/create/get/search/revise/confirm/supersede/recordDecision/close`.
- [ ] **Step 2: Run** `cd mcp-spike && node --test memory-backend-factory.test.js` and verify RED if either backend contract is incomplete.
- [ ] **Step 3: Make only minimal factory changes** required for parity; do not rename environment variables or change backend selection.
- [ ] **Step 4: Run** `cd mcp-spike && node --test memory-backend-factory.test.js` and require zero failures.
- [ ] **Step 5: Commit** with `git commit -m "test: lock memory backend semantic parity"`.

### Task 5: Eight-tool MCP contract and additive compatibility

**Files:**
- Modify: `mcp-spike/server.js`
- Create: `mcp-spike/server.test.js`
- Modify: `mcp-spike/package.json` only to bump the spike version; do not change dependencies unless required by the MCP SDK already present.

**Interfaces:**
- Register exactly: `memory_status`, `memory_create`, `memory_get`, `memory_search`, `memory_revise`, `memory_confirm`, `memory_supersede`, `decision_record`.
- `memory_get` response: `{ found, item, state? }`; exact requested item never redirects.
- `memory_search` input adds `includeHistory: boolean = false`; result items retain the existing item fields and add `state` additively.
- `memory_status` retains all existing fields and adds `events`.

- [ ] **Step 1: Write server tests** for exact eight-tool listing, valid/invalid Zod arguments, exact-ID `memory_get`, default/current search, `includeHistory=true`, and all four new tools.
- [ ] **Step 2: Run** `cd mcp-spike && node --test server.test.js` and verify RED because the new tools are absent.
- [ ] **Step 3: Refactor server construction just enough** to let tests instantiate the MCP handler without binding a real HTTP port; keep production startup behavior unchanged.
- [ ] **Step 4: Register** the four new tools and adapt existing get/search/status handlers to the descriptor contract while preserving old item fields.
- [ ] **Step 5: Normalize semantic backend errors** into concise MCP failures containing stable codes but no backend details, SQL, credentials, or arbitrary memory content.
- [ ] **Step 6: Update startup `tools/list` expectation** to the exact eight names and preserve the deterministic `teste-123` persistence check.
- [ ] **Step 7: Run** `cd mcp-spike && node --test server.test.js` and require zero failures.
- [ ] **Step 8: Run** `cd mcp-spike && npm test` and require the full suite to pass.
- [ ] **Step 9: Commit** with `git commit -m "feat: expose semantic persistent memory tools"`.

### Task 6: Idempotent remote semantic restart probe

**Files:**
- Modify: `mcp-spike/server.js`
- Modify: `mcp-spike/server.test.js`

**Interfaces:**
- Synthetic fixed IDs under scope `spike:semantic-restart-proof`.
- Probe must use MCP `tools/call`, not backend methods directly.
- First startup may seed the semantic records; later startups must only verify existing durable state except for a one-time confirmation when none exists.

- [ ] **Step 1: Write failing tests** for first-run seed and second-run verification using fixed IDs such as `semantic-old-v01`, `semantic-new-v01`, `semantic-super-old-v01`, `semantic-super-new-v01`, and `semantic-decision-v01`.
- [ ] **Step 2: Implement the idempotent probe**: revise old→new, confirm new once, supersede the second pair, and record one decision with synthetic rationale/alternatives/context.
- [ ] **Step 3: On subsequent startup, verify** old exact content, successor relation, confirmation count, default/history search split, explicit supersession, and `state.decision` metadata for the fixed decision ID before any replacement write.
- [ ] **Step 4: Log only booleans, counts, fixed synthetic IDs, backend name, and persistence mode**; never log arbitrary content or rationale.
- [ ] **Step 5: Run** `cd mcp-spike && npm test` plus `node --check server.js` and require zero failures.
- [ ] **Step 6: Commit** with `git commit -m "test: add semantic restart persistence probe"`.

### Task 7: Documentation, full verification, and D1/Render acceptance gate

**Files:**
- Modify: `mcp-spike/README.md`
- No production code unless verification finds a defect.

**Interfaces:**
- Document all eight tools, append-only semantics, exact-ID historical reads, current-only default search, `includeHistory=true`, D1 durability, and synthetic-data safety boundary.

- [ ] **Step 1: Update README** with the eight-tool contract and the `memory_items + memory_events` model; state clearly that the service remains a spike.
- [ ] **Step 2: Run local verification:** `cd mcp-spike && npm test && node --check server.js && node --check memory-backend.js && node --check d1-memory-backend.js && node --check memory-semantics.js`.
- [ ] **Step 3: Confirm the full suite reports zero failures** and that no fixture or log contains a real Cloudflare credential or personal memory.
- [ ] **Step 4: Push the completed branch**, then manually/API-trigger the Render deploy because this public-URL service does not currently have a working Git provider webhook connection.
- [ ] **Step 5: Verify first D1 startup logs** show `backend="cloudflare-d1"`, `persistence="remote-durable"`, exact eight tools, raw `teste-123` success, and semantic probe success.
- [ ] **Step 6: Trigger a second deploy of the same commit** with no data/schema reset.
- [ ] **Step 7: Verify second startup** finds the fixed semantic old/new records and decision before seeding, reports revision/confirmation/supersession/decision checks true, and still reports `teste-123` preexisting.
- [ ] **Step 8: Inspect D1-related errors/logs for secret leakage** and confirm no API token, raw SQL with user content, or arbitrary decision rationale was emitted.
- [ ] **Step 9: Commit documentation/verification notes** with `git commit -m "docs: verify durable semantic memory history"` if documentation changed after remote proof.

## Definition of Done

The slice is complete only when:

1. local SQLite and D1 expose the same semantic backend contract;
2. all tests pass;
3. the MCP exposes exactly eight tools;
4. old IDs remain exact and immutable;
5. default search hides historical versions while audit search can recover them;
6. confirmations, supersession, and decision metadata survive process replacement;
7. invalid graphs are rejected;
8. `teste-123` still survives Render redeploy;
9. the fixed semantic probe survives a second deploy of the same commit;
10. no real secret or personal data is introduced.