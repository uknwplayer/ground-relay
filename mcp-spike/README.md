# Persistent Memory MCP Spike

Feasibility spike for a remote ChatGPT-compatible MCP memory service with immutable items, append-only semantic history, and durable Cloudflare D1 persistence.

## Endpoint

- `GET /health` — service health.
- `POST /mcp` — MCP Streamable HTTP endpoint.

## MCP tools

The server exposes exactly eight tools:

- `memory_status` — backend status, item count, event count, write capability, and persistence mode.
- `memory_create` — creates one immutable memory item.
- `memory_get` — reads the exact requested ID; historical IDs never redirect to newer versions.
- `memory_search` — literal case-insensitive search; current memories only by default, with `includeHistory=true` for audit reads.
- `memory_revise` — creates a new immutable item and appends a `revision` relation from the old item to the new one.
- `memory_confirm` — appends a confirmation event without changing item content.
- `memory_supersede` — links two already-existing current memories with an explicit supersession relation.
- `decision_record` — persists a decision plus rationale, rejected alternatives, and optional context.

## Data model

The semantic layer is hybrid append-only:

```text
immutable memory_items
        +
append-only memory_events
        ↓
derived current/history state
```

`memory_items` stores immutable content. `memory_events` stores `revision`, `confirmation`, `supersede`, and `decision_recorded` events. There is no mutable `current` column: current/historical state is derived from outgoing successor events.

A memory may have at most one outgoing `revision` or `supersede` successor. Self-supersession, branching successors, and cycles are rejected.

## Exact-ID and search semantics

`memory_get(id)` always returns the item originally created under that ID. If it has been replaced, derived state reports fields such as `current:false`, `supersededBy`, and `supersessionType`; the read never silently follows the successor.

`memory_search` defaults to `includeHistory=false`, so superseded/revised versions are hidden from ordinary retrieval. Set `includeHistory=true` to recover historical matches for audit work.

## Backend modes

### Local SQLite (default)

Without `MEMORY_BACKEND=d1`, the spike uses Node's built-in SQLite API. The default path is `mcp-spike/data/memory.sqlite`; `MEMORY_DB_PATH` can override it.

Initialization is non-destructive: existing `memory_items` rows remain untouched while `memory_events` and its indexes are created with `IF NOT EXISTS`.

### Cloudflare D1

Set these variables in the hosting platform:

```text
MEMORY_BACKEND=d1
CLOUDFLARE_ACCOUNT_ID=<account id>
CLOUDFLARE_D1_DATABASE_ID=<D1 database UUID>
CLOUDFLARE_API_TOKEN=<D1 write-capable API token>
```

The D1 adapter uses parameterized SQL. Multi-write revision and decision operations use a single D1 batch so item/event writes are committed or rolled back together.

Never commit the API token, paste it into chat, store it as memory metadata, or print it in logs.

## Durability proof

Raw durability remains guarded by the fixed synthetic `teste-123` probe.

The semantic layer adds fixed synthetic restart-proof records for:

- revision old -> new;
- one confirmation on the revised memory;
- explicit supersession between two existing memories;
- one decision with rationale/alternatives/context;
- current-only versus historical search behavior.

On 2026-09-29, the D1-backed Render service passed two deployments of the same code commit. The first process seeded the semantic proof and reported all checks true. The replacement process found the same records and events before any semantic write, reporting:

```text
preexisting=true
seeded=false
revision=true
confirmation=true
supersession=true
decision=true
currentSearch=true
historySearch=true
persistence=remote-durable
```

The second process also found `teste-123` preexisting. This proves persistence of both immutable memory items and append-only semantic events across Render process replacement for this spike.

## Verification

Local tests cover:

- old SQLite schema migration without data loss;
- revision immutability and exact-ID reads;
- current-only and historical search;
- repeated/historical confirmations;
- supersession conflicts and cycle rejection;
- structured decision metadata;
- SQLite close/reopen durability;
- D1 schema/batch mapping and secret-safe failures;
- backend contract parity;
- eight-tool MCP operation contract;
- idempotent semantic restart probe.

Remote startup self-tests additionally validate the real MCP SDK wiring against D1.

## Safety boundary

This is still a synthetic-data spike, not the final private/personal-memory product. Do not store passwords, API tokens, private keys, seed phrases, authentication cookies, sensitive personal history, or raw private conversation exports here.

This branch remains isolated from `main` and is intentionally disposable until the semantic contract is promoted into the standalone persistent-memory project.
