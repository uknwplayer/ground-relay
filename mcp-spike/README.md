# Persistent Memory MCP Spike

Throwaway feasibility spike for connecting ChatGPT to a remote MCP endpoint.

## Endpoint

- `GET /health` — service health
- `POST /mcp` — MCP Streamable HTTP endpoint

## Read-only tools

- `memory_status` — reports service mode and SQLite demo backend status.
- `memory_get` — reads one synthetic demo memory by exact id.
- `memory_search` — performs bounded literal case-insensitive search over synthetic demo memories.

## Backend

The spike seeds two synthetic records into an in-memory SQLite database at startup and then enables `PRAGMA query_only = ON`. No MCP write tool exists. The data survives only for the lifetime of the running Render process and is not personal memory.

This branch is intentionally isolated from `main` and is not the final persistent-memory MCP implementation.
