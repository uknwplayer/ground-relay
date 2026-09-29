# Persistent Memory MCP Spike

Throwaway feasibility spike for connecting ChatGPT to a remote MCP endpoint.

## Endpoint

- `GET /health` — service health
- `POST /mcp` — MCP Streamable HTTP endpoint

## Tool

- `memory_status` — read-only. Returns service status only. No persistent-memory backend is connected.

This branch is intentionally isolated from `main` and is not the final memory MCP implementation.
