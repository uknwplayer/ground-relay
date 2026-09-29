---
name: memory-status
description: Check whether the Persistent Memory MCP spike is reachable and report its read-only backend status.
---

Use the `memory_status` MCP tool.

Report the returned service name, mode, whether a memory backend is connected, and timestamp. Do not infer that real persistent memory is available unless the tool explicitly reports a connected backend.
