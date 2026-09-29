# Persistent Memory D1 Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional Cloudflare D1 backend to the writable MCP spike so test memories can survive Render process restarts without changing the MCP tool contract.

**Architecture:** Keep the current local SQLite backend as the default. Add a D1 adapter that implements the same `status/create/get/search/close` contract over Cloudflare's D1 REST query endpoint, then select it through environment variables. MCP tools remain `memory_status`, `memory_create`, `memory_get`, and `memory_search`.

**Tech Stack:** Node.js 22+, built-in `fetch`, Cloudflare D1 REST API, MCP SDK, Zod, `node:test`.

**Spec:** `mcp-spike/README.md`

## Global Constraints

- Do not put Cloudflare credentials in source, logs, fixtures, or documentation.
- Keep local SQLite as the zero-configuration default.
- D1 mode requires `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_D1_DATABASE_ID`, and `CLOUDFLARE_API_TOKEN`.
- Preserve the four-tool MCP contract.
- Use synthetic test memories only.

## Review Focus

- Missing D1 environment variables must fail fast without exposing secret values.
- Cloudflare non-2xx responses must become sanitized backend errors.
- Cloudflare envelopes with `success: false` must not be treated as successful queries.
- Parameterized SQL must be used for memory values; never interpolate memory content into SQL.
- Local SQLite behavior must remain unchanged when D1 is not configured.

---

### Task 1: D1 backend contract

**Files:**
- Create: `mcp-spike/d1-memory-backend.js`
- Create: `mcp-spike/d1-memory-backend.test.js`

**Interfaces:**
- Produces: `createD1MemoryBackend({ accountId, databaseId, apiToken, apiBaseUrl?, fetchImpl? })`
- Backend methods: async `init()`, `status()`, `create(input)`, `get(id)`, `search(query, limit)`, `close()`.

- [ ] **Step 1: Write failing tests** for authenticated D1 query requests, schema initialization, create/get/search mapping, sanitized API failure, and missing configuration.
- [ ] **Step 2: Run** `node --test d1-memory-backend.test.js` and verify failures are caused by the missing adapter.
- [ ] **Step 3: Implement** the minimal adapter using `POST /accounts/{accountId}/d1/database/{databaseId}/query` with parameterized SQL.
- [ ] **Step 4: Run** `node --test d1-memory-backend.test.js` and require zero failures.

### Task 2: Backend selection and MCP async compatibility

**Files:**
- Create: `mcp-spike/memory-backend-factory.js`
- Create: `mcp-spike/memory-backend-factory.test.js`
- Modify: `mcp-spike/server.js`

**Interfaces:**
- Produces: async `createMemoryBackendFromEnv(env)` returning either the local SQLite backend or initialized D1 backend.

- [ ] **Step 1: Write failing factory tests** proving default local SQLite selection, explicit D1 selection, and fail-fast missing D1 configuration.
- [ ] **Step 2: Run** the factory tests and verify RED.
- [ ] **Step 3: Implement** the factory and change MCP handlers to `await` backend methods so both synchronous local SQLite and asynchronous D1 work through the same contract.
- [ ] **Step 4: Run** all `mcp-spike` tests and require zero failures.

### Task 3: Configuration documentation and deployment gate

**Files:**
- Modify: `mcp-spike/README.md`

**Interfaces:**
- Consumes: the environment contract from Task 2.

- [ ] **Step 1: Document** D1 mode, the three required environment variable names, and the rule never to paste API tokens into chat or commit them.
- [ ] **Step 2: Run** `npm test --prefix mcp-spike` and syntax-check the server.
- [ ] **Step 3: Commit** implementation atomically to `spike-mcp-memory-status`.
- [ ] **Step 4: Deploy only after D1 credentials are configured in Render**, then prove `memory_create → restart → memory_get/memory_search` with a fixed synthetic test id.
