# Persistent Memory MCP Spike

Throwaway feasibility spike for connecting ChatGPT-compatible MCP clients to a remote writable memory endpoint.

## Endpoint

- `GET /health` — service health.
- `POST /mcp` — MCP Streamable HTTP endpoint.

## Tools

- `memory_status` — reports backend status, record count, write capability, and persistence mode.
- `memory_create` — creates one synthetic test memory. Optional caller-provided `id`; generated automatically when omitted.
- `memory_get` — reads one test memory by exact id.
- `memory_search` — performs bounded literal case-insensitive search over test memories.

## Backend

The spike uses Node's built-in SQLite API. By default the server stores the database at `mcp-spike/data/memory.sqlite`; `MEMORY_DB_PATH` can override that path.

The backend seeds two synthetic records with `INSERT OR IGNORE`, supports writes, and keeps created records when the same SQLite file is closed and reopened. Automated tests cover create/read/search and file-backed reopen persistence.

## Important Render limitation

The current Render service runs on the Free plan. Render's default filesystem is ephemeral, so a local SQLite file is not durable across a Render service restart or redeploy unless the service has persistent storage. Therefore this spike proves:

1. MCP write/read/search behavior on the remote service.
2. SQLite persistence across backend close/reopen when the same file remains available.

It does **not** yet prove long-term memory persistence across Render Free service restarts. That requires a persistent disk or an external durable datastore.

## Safety boundary

Use only synthetic test data in this spike. It is not the final personal-memory service and should not receive secrets, credentials, or sensitive personal information.

This branch remains isolated from `main` and is intentionally disposable.
