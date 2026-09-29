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

The MCP tool contract is the same for both supported backends.

## Backend modes

### Local SQLite (default)

Without `MEMORY_BACKEND=d1`, the spike uses Node's built-in SQLite API. By default the server stores the database at `mcp-spike/data/memory.sqlite`; `MEMORY_DB_PATH` can override that path.

The local backend seeds two synthetic records with `INSERT OR IGNORE`, supports writes, and keeps created records when the same SQLite file is closed and reopened. Automated tests cover create/read/search and file-backed reopen persistence.

### Cloudflare D1 (durable remote test)

Set:

```text
MEMORY_BACKEND=d1
CLOUDFLARE_ACCOUNT_ID=<account id>
CLOUDFLARE_D1_DATABASE_ID=<D1 database UUID>
CLOUDFLARE_API_TOKEN=<D1 Read + D1 Write API token>
```

The D1 adapter initializes the same `memory_items` schema and implements the same `status/create/get/search/close` backend contract through Cloudflare's D1 query API. Memory values are passed as SQL parameters rather than interpolated into SQL.

Never commit the API token, paste it into chat, or print it in logs. Configure it as a secret environment variable in the hosting platform.

## Persistence gate

The current Render service runs on the Free plan. Render's default filesystem is ephemeral, so local SQLite does **not** survive a service restart or redeploy there. Local mode proves MCP write behavior and SQLite file persistence only while the same filesystem remains available.

D1 exists specifically to complete the stronger test:

```text
1. memory_create writes a fixed synthetic id
2. the Render service is restarted/redeployed
3. memory_get retrieves the same id
4. memory_search finds the same id
```

Only after that sequence passes can this spike claim persistence across service restarts.

## Deployment verification

A remote deployment is valid only when its startup self-test reports all four operations — `status`, `create`, `get`, and `search` — as successful. In D1 mode the reported persistence must be `remote-durable`.

## Safety boundary

Use only synthetic test data in this spike. It is not the final personal-memory service and should not receive secrets, credentials, or sensitive personal information.

This branch remains isolated from `main` and is intentionally disposable.
