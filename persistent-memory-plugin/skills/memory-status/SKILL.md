---
name: memory-status
description: Inspect the Persistent Memory MCP spike and read or search its synthetic read-only SQLite demo memories.
---

Use the MCP tools according to the request:

- `memory_status` for service/backend status.
- `memory_get` to read one synthetic demo memory by exact id.
- `memory_search` to search the synthetic demo memories.

Treat this as a feasibility spike only. The backend is read-only SQLite demo data with process-lifetime persistence; it is not the user's real persistent memory. Never claim that writes or durable personal memory are available.
