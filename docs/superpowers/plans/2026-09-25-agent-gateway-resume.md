# M7 Agent Gateway and Resume Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the existing in-memory Agent Gateway into a restart-safe, non-custodial service that binds external tasks to Ground Relay PDAs, reconciles authoritative devnet state, and resumes the originating agent through an idempotent persisted callback.

**Architecture:** Split the Gateway into focused store, chain, callback, service, and HTTP transport modules. Persist versioned state in an atomically replaced local JSON file, treat Solana as authoritative after binding, and represent each confirmed PAID settlement as one deterministic resume event whose HTTP delivery can be retried safely across restarts.

**Tech Stack:** Node.js 22 ESM, Node `http`/`fs`/`crypto`/`node:test`, global `fetch`, `@solana/web3.js@1.99.0`, Solana devnet, JSON persistence, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-25-agent-gateway-resume-design.md`

## Global Constraints

- Gateway remains non-custodial: never accept, reconstruct, persist, or log poster/worker private keys, seed phrases, wallet secrets, or deployment secrets.
- M7 cluster is exactly `devnet`.
- Configured Ground Relay program ID is `6v2peeoZVj2AXfczVLqyMUTHYt3XQPqAxCktpTwjUZap`.
- Default durable state path is `gateway/data/state.json`, configurable for tests/runtime.
- Mutable `gateway/data/` runtime state is gitignored.
- Persisted state envelope is `schemaVersion: 1`.
- Newly created M7 tasks require `callbackUrl`; callback schemes are HTTP(S), with loopback HTTP allowed only when development/test configuration explicitly permits it.
- Bound task status comes from Solana; client-supplied paid/worker/mint/reward/evidence state is never authoritative.
- Resume identity key is exactly `ground-relay:{taskId}:paid:{settlementSignature}`.
- `eventId` is lowercase SHA-256 hex of the exact resume identity key.
- Callback delivery semantics are “one logical event, at-least-once HTTP transport until acknowledgement,” never “exactly-once HTTP delivery.”
- Retry delays after the immediate attempt are exactly `1s, 2s, 4s, 8s, 16s` (maximum five automatic retries).
- Deterministic CI uses temporary state plus fake chain adapters; it must not require devnet availability or wallet/poster secrets.
- Existing bound tasks may not be mutated by legacy local claim/delivery/verify routes; return `409 chain_authoritative` instead.

## Review Focus

- Corrupt/truncated or unsupported-schema state files must fail closed on startup and must never be silently replaced by an empty store; pinned in Task 1 tests.
- Two different external task IDs must not be allowed to bind to the same task PDA, because that could create duplicate logical resume events for one settlement; pinned in Task 4 tests.
- A stale RPC read must not move local status backward (including nonterminal regressions such as `claimed -> open`), and terminal `paid`/`cancelled` must never regress; pinned in Task 4 tests.
- A callback timeout after the receiver may already have processed the request must retry with the exact same `eventId` and `Idempotency-Key`, never create a second event; pinned in Task 5 tests.
- Wrong account owner, discriminator, too-short account data, or unknown status index must be rejected as chain identity/data mismatch rather than accepted as task state; pinned in Task 2 and Task 4 tests.

---

## File Structure

- `gateway/store.mjs` — versioned JSON persistence, serialized transactions, atomic replacement.
- `gateway/store.test.mjs` — persistence, restart, corruption, serialization, idempotency/retry metadata tests.
- `gateway/chain.mjs` — Solana devnet account read and Ground Relay task decoder.
- `gateway/chain.test.mjs` — decoder/account-owner/status tests with fixture bytes; no network.
- `gateway/callbacks.mjs` — callback URL policy, deterministic resume event construction, HTTP result classification.
- `gateway/callbacks.test.mjs` — URL, event identity, headers, response/error classification tests.
- `gateway/service.mjs` — durable task lifecycle orchestration, binding, sync, settlement, callback/retry state machine, legacy unbound transitions.
- `gateway/service.test.mjs` — domain/idempotency/binding/sync/settlement/retry/restart tests with fake dependencies.
- `gateway/server.mjs` — HTTP transport and environment wiring only.
- `gateway/server.test.mjs` — route validation, status mapping, durable HTTP restart tests.
- `gateway/demo.mjs` — deterministic runnable mock-agent/fake-chain resume demonstration.
- `gateway/demo.test.mjs` — seeded blocked→paid→resume→restart/no-duplicate proof.
- `gateway/package.json` — run all tests, demo script, exact Solana client dependency.
- `gateway/package-lock.json` — reproducible Gateway dependency lock.
- `.github/workflows/gateway-check.yml` — install locked dependencies and run deterministic Gateway test suite.
- `.gitignore` — ignore `gateway/data/`.
- `docs/openapi.yaml` — final M7 HTTP contract.
- `README.md`, `docs/roadmap.md`, `docs/checkpoints/CURRENT.md` — M7 proof/status documentation after the implementation is verified.

### Task 1: Durable JSON Store

**Files:**
- Create: `gateway/store.mjs`
- Create: `gateway/store.test.mjs`
- Modify: `gateway/package.json`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `createJsonStore({ statePath })` returning `{ init(), transaction(mutator), readSnapshot(), getTask(taskId), listTasks(), getIdempotency(key) }`.
- `transaction(mutator)` serializes mutations, passes a mutable `{ schemaVersion, tasks, idempotency }` draft to `mutator`, atomically persists the completed draft, and returns the mutator result; if `mutator` throws, no write is committed.
- Consumers in later tasks treat returned snapshots/tasks as copies, not mutable store internals.

- [ ] **Step 1: Update the Gateway test script and write failing empty-store/reload tests**

Change `gateway/package.json` test command to `node --test *.test.mjs`. In `gateway/store.test.mjs`, add tests asserting: missing state initializes `{schemaVersion:1,tasks:{},idempotency:{}}`; a transaction persists a task; a fresh store instance reloads that task from the same temporary path.

- [ ] **Step 2: Run the store tests and verify they fail**

Run: `cd gateway && npm test -- --test-name-pattern="store|reload"`

Expected: FAIL because `store.mjs` / `createJsonStore` does not exist.

- [ ] **Step 3: Implement store initialization, reads, serialized transactions, and atomic replace**

Implement `createJsonStore({ statePath })` in `gateway/store.mjs`. Use a per-store promise queue for serialized transactions; write `state.json.tmp-<pid>-<nonce>` in the same directory, close it, then rename over the canonical file.

- [ ] **Step 4: Add failing corruption/schema/rollback/concurrent-mutation tests**

Add tests asserting: invalid JSON rejects `init()` and leaves bytes untouched; `schemaVersion !== 1` rejects; a throwing transaction does not change persisted state; concurrent `transaction()` calls are serialized with no lost updates; callback retry metadata and idempotency records survive reload.

- [ ] **Step 5: Run store tests and verify the new cases fail where implementation is incomplete**

Run: `cd gateway && node --test store.test.mjs`

Expected: at least the newly added edge-case test(s) FAIL before hardening.

- [ ] **Step 6: Harden validation/rollback/serialization until all store tests pass**

Keep validation structural and minimal: top-level object, `schemaVersion === 1`, object `tasks`, object `idempotency`. Never replace a corrupt existing file with empty state.

- [ ] **Step 7: Gitignore mutable runtime state and run the complete Gateway suite**

Add `gateway/data/` to `.gitignore`.

Run: `cd gateway && npm test`

Expected: PASS for existing server tests plus all new store tests.

- [ ] **Step 8: Commit**

```bash
git add gateway/store.mjs gateway/store.test.mjs gateway/package.json .gitignore
git commit -m "feat: add durable gateway state store"
```

### Task 2: Ground Relay Chain Adapter

**Files:**
- Create: `gateway/chain.mjs`
- Create: `gateway/chain.test.mjs`
- Modify: `gateway/package.json`
- Create: `gateway/package-lock.json`
- Modify: `.github/workflows/gateway-check.yml`

**Interfaces:**
- Produces: `decodeGroundRelayTaskAccount({ data, owner, expectedProgramId }) -> { taskIdHex, poster, worker, mint, rewardAtomic, expiresAt, status, evidenceHash }`.
- Produces: `createSolanaChainAdapter({ rpcUrl, programId })` returning `{ readTask(taskPda) }`.
- `readTask(taskPda)` returns the same normalized object plus `taskPda`; it never signs transactions.
- Ground Relay layout is the deployed layout already used by `src/solana/ground-relay.ts`: discriminator `[209,72,197,54,17,55,3,187]`, minimum 187 bytes, task ID `8..40`, poster `40..72`, worker `72..104`, mint `104..136`, reward u64 LE at `136`, expiry i64 LE at `144`, status byte `152`, evidence hash `153..185`, status indices `0..5 => open,claimed,delivered,accepted,paid,cancelled`.

- [ ] **Step 1: Add the exact Solana dependency and locked install**

Run: `cd gateway && npm install --save-exact @solana/web3.js@1.99.0`

Update `.github/workflows/gateway-check.yml` to run `npm ci` before `npm test` in `gateway/`.

- [ ] **Step 2: Write failing decoder tests using deterministic account bytes**

In `gateway/chain.test.mjs`, construct a 187-byte fixture with the exact discriminator/layout and assert decoded poster/worker/mint base58 values, reward string, expiry, status, evidence hash, and zero-worker/zero-evidence omission behavior.

- [ ] **Step 3: Run decoder tests and verify they fail**

Run: `cd gateway && node --test chain.test.mjs`

Expected: FAIL because `chain.mjs` does not exist.

- [ ] **Step 4: Implement the decoder and adapter**

Use `PublicKey`/`Connection` from `@solana/web3.js`. `createSolanaChainAdapter` calls `connection.getAccountInfo(new PublicKey(taskPda), "confirmed")`, rejects missing accounts, and delegates decoding. No Anchor client dependency is needed.

- [ ] **Step 5: Add failing defense tests for wrong owner/discriminator/length/status**

Tests must assert rejection when: `owner !== expectedProgramId`; discriminator differs; data length `<187`; status byte is outside `0..5`.

- [ ] **Step 6: Run and harden until chain tests pass**

Run: `cd gateway && node --test chain.test.mjs`

Expected: PASS, with no live RPC access.

- [ ] **Step 7: Verify locked CI-style install and all Gateway tests**

Run: `cd gateway && npm ci && npm test`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add gateway/chain.mjs gateway/chain.test.mjs gateway/package.json gateway/package-lock.json .github/workflows/gateway-check.yml
git commit -m "feat: add ground relay chain adapter"
```

### Task 3: Resume Event and Callback Transport

**Files:**
- Create: `gateway/callbacks.mjs`
- Create: `gateway/callbacks.test.mjs`

**Interfaces:**
- Produces: `validateCallbackUrl(url, { allowLoopbackHttp }) -> URL`.
- Produces: `buildResumeEvent({ task, settlementSignature, paidAtObserved }) -> { eventId, idempotencyKey, payload }`.
- Produces: `sendResumeCallback({ url, eventId, idempotencyKey, payload, fetchImpl = fetch, timeoutMs = 5000 }) -> { classification, statusCode?, error? }` where classification is `delivered | retryable_failure | terminal_failure`.
- Payload type is exactly `ground_relay.task.paid`; idempotency key is exactly `ground-relay:{taskId}:paid:{settlementSignature}`; `eventId` is SHA-256 hex of that string.

- [ ] **Step 1: Write failing URL/event identity tests**

Assert: HTTPS accepted; loopback HTTP accepted only with `allowLoopbackHttp: true`; `file:`, `ftp:`, and non-loopback HTTP in strict mode rejected; repeated event construction yields identical key/event ID and preserves supplied `paidAtObserved`.

- [ ] **Step 2: Run tests and verify failure**

Run: `cd gateway && node --test callbacks.test.mjs`

Expected: FAIL because callback module does not exist.

- [ ] **Step 3: Implement URL validation and deterministic event construction**

Use `URL` and `createHash("sha256")`. Payload fields are `type,eventId,taskId,status,taskPda,evidenceHash,settlementSignature,worker,rewardAtomic,rewardMint,paidAtObserved`.

- [ ] **Step 4: Write failing transport-classification tests**

Inject a fake `fetchImpl` and assert: any 2xx => `delivered`; network throw/timeout/408/425/429/500 => `retryable_failure`; 400/401/403/404/422 => `terminal_failure`; request includes `content-type: application/json`, `Idempotency-Key`, and stable event metadata.

- [ ] **Step 5: Implement `sendResumeCallback` and verify all callback tests pass**

Run: `cd gateway && node --test callbacks.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add gateway/callbacks.mjs gateway/callbacks.test.mjs
git commit -m "feat: add idempotent resume callback transport"
```

### Task 4: Service Create, Binding, Sync, and Legacy Authority Rules

**Files:**
- Create: `gateway/service.mjs`
- Create: `gateway/service.test.mjs`

**Interfaces:**
- Produces: `createRelayService({ store, chain, callbackTransport, clock, scheduler, allowLoopbackHttp })`.
- Service methods introduced in this task: `start()`, `createTask(input,{idempotencyKey}={})`, `getTask(taskId)`, `bindTask(taskId,binding)`, `syncTask(taskId)`, `claimLocal(taskId,input)`, `deliverLocal(taskId,input)`, `verifyLocal(taskId,input)`.
- `clock.now()` returns epoch milliseconds. Tests inject a deterministic clock.
- Domain errors are thrown as objects/errors carrying stable `code`; HTTP mapping is Task 6.
- Binding input: `{ cluster, programId, taskPda, postSignature }`; cluster must be `devnet`, program ID must equal configured Ground Relay ID.

- [ ] **Step 1: Write failing durable create/idempotency tests**

Assert callback URL required; task is persisted; same `Idempotency-Key` + canonical-equal request returns original task; same key + different request throws `idempotency_conflict`; restart via a new store/service sees the same task/idempotency record.

- [ ] **Step 2: Run targeted service tests and verify failure**

Run: `cd gateway && node --test service.test.mjs --test-name-pattern="create|idempotency|restart"`

Expected: FAIL because `service.mjs` does not exist.

- [ ] **Step 3: Implement create/get plus canonical request hashing**

Use stable canonical serialization for the create request before SHA-256 hashing; do not hash incidental generated timestamps. Validate callback URLs through Task 3’s `validateCallbackUrl`.

- [ ] **Step 4: Write failing binding tests**

Assert: first valid binding calls `chain.readTask` and persists only after identity validation; exact repeat succeeds without mutation; changed binding => `binding_conflict`; failed chain validation leaves task unbound; same `taskPda` cannot bind to a different external task; wrong cluster/program/poster/mint/reward => conflict/mismatch without persistence.

- [ ] **Step 5: Implement `bindTask` and PDA uniqueness check**

Compare on-chain poster, mint, and reward to the logical task. Persist `boundAt` and `lastSyncedAt` only after successful read/validation.

- [ ] **Step 6: Write failing synchronization/monotonicity tests**

Assert: unbound => `task_not_bound`; RPC error => `chain_unavailable` and no mutation; worker/status/evidence are taken from chain; wrong account identity => `chain_mismatch`; `claimed -> open` stale read does not regress; `paid` and `cancelled` never regress; paid sync creates eligibility for the settlement path but does not invent a settlement signature.

- [ ] **Step 7: Implement status rank/terminal rules and `syncTask`**

Use status rank `open=0, claimed=1, delivered=2, accepted=3, paid=4`, with `cancelled` terminal from open. Reject incompatible terminal/state transitions rather than overwriting trusted terminal state.

- [ ] **Step 8: Move legacy local claim/deliver/verify domain logic into the service**

Preserve existing unbound demo semantics, but if `task.chain` exists each mutating legacy method throws `chain_authoritative`. Keep wrong-worker/wrong-poster/input validation behavior already covered by server tests.

- [ ] **Step 9: Run service tests and full Gateway tests**

Run: `cd gateway && node --test service.test.mjs && npm test`

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add gateway/service.mjs gateway/service.test.mjs
git commit -m "feat: add durable gateway domain service"
```

### Task 5: Verified Settlement, Persisted Retry Scheduler, and Restart Recovery

**Files:**
- Modify: `gateway/service.mjs`
- Modify: `gateway/service.test.mjs`

**Interfaces:**
- Adds service methods: `notifyPaid(taskId,{signature})`, `retryResume(taskId)`, `restorePendingRetries()`.
- Scheduler contract: `scheduler.schedule(atMs, callback) -> cancelFn`; production uses `setTimeout`, tests use a fake scheduler.
- Resume persistence adds `attempts` (total attempts), `autoRetriesUsed` (current automatic retry budget counter), `nextAttemptAt`, `lastAttemptAt`, `lastStatusCode`, `lastError`, `deliveredAt`, `paidAtObserved`, while preserving one `eventId` and `idempotencyKey`.

- [ ] **Step 1: Write failing settlement-authority/idempotency tests**

Assert: unbound/non-paid chain => `settlement_not_confirmed` and no resume event; same confirmed signature repeated reuses one settlement/event; different signature after acceptance => `settlement_conflict`; missing callback on a migrated legacy record => `callback_not_configured`.

- [ ] **Step 2: Run settlement tests and verify failure**

Run: `cd gateway && node --test service.test.mjs --test-name-pattern="settlement|paid|resume"`

Expected: FAIL until methods exist.

- [ ] **Step 3: Implement `notifyPaid` through authoritative sync**

Order is mandatory: compare existing accepted signature -> sync chain -> require `paid` and identity match -> persist signature -> create/reuse event with one `paidAtObserved` -> attempt callback unless already delivered.

- [ ] **Step 4: Write failing callback outcome/retry persistence tests**

Assert: immediate 2xx marks delivered and no timer; retryable failure persists attempt metadata and `nextAttemptAt` before `scheduler.schedule`; terminal failure schedules nothing; retry delays are exactly `1000,2000,4000,8000,16000` ms; after five automatic retries, no further automatic schedule occurs.

- [ ] **Step 5: Implement persisted callback attempt and automatic retry logic**

Every transport attempt reuses the exact existing `eventId`/idempotency key. `attempts` is total attempts; `autoRetriesUsed` tracks only the current automatic budget.

- [ ] **Step 6: Write failing restart recovery/manual retry tests**

Assert: future `nextAttemptAt` schedules at that time on `restorePendingRetries`; overdue schedules immediately; delivered never resends; exhausted retry remains inspectable; manual retry preserves event identity and resets `autoRetriesUsed` only; non-paid/no-event => `resume_not_ready`.

- [ ] **Step 7: Add timeout-ambiguity identity regression test**

Simulate a callback transport returning retryable timeout after recording the first request; execute the retry and assert both sends have identical payload `eventId`, `paidAtObserved`, settlement signature, and `Idempotency-Key`.

- [ ] **Step 8: Implement restart recovery and manual retry**

`start()`/`restorePendingRetries()` scans persisted events according to the spec and uses only persisted timestamps/state to decide scheduling.

- [ ] **Step 9: Run service and full Gateway tests**

Run: `cd gateway && node --test service.test.mjs && npm test`

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add gateway/service.mjs gateway/service.test.mjs
git commit -m "feat: add verified agent resume retries"
```

### Task 6: HTTP Transport Refactor and M7 Routes

**Files:**
- Modify: `gateway/server.mjs`
- Modify: `gateway/server.test.mjs`

**Interfaces:**
- `createRelayServer({ service })` returns the Node HTTP server and contains no task `Map`.
- `createDefaultRelayServiceFromEnv()` wires JSON store, Solana chain adapter, callback transport, real clock/scheduler.
- Environment: `GROUND_RELAY_STATE_PATH` (default `gateway/data/state.json`), `GROUND_RELAY_RPC_URL` (default `https://api.devnet.solana.com`), `GROUND_RELAY_PROGRAM_ID` (default canonical program), `GROUND_RELAY_ALLOW_LOOPBACK_HTTP=1` for local/dev loopback HTTP.
- Routes: durable `POST /v1/tasks`, `GET /v1/tasks/{id}`, existing unbound claim/deliveries/verify, `PUT /v1/tasks/{id}/chain-binding`, `POST /v1/tasks/{id}/sync`, verified `POST /v1/tasks/{id}/paid`, `POST /v1/tasks/{id}/resume/retry`.

- [ ] **Step 1: Rewrite server test harness around an injected service and add failing M7 route tests**

Add tests for callback requirement, `Idempotency-Key` pass-through, binding PUT, sync POST, paid POST, retry POST, durable GET after stop/restart with the same temporary state, and `chain_authoritative` on legacy mutation of a bound task.

- [ ] **Step 2: Run server tests and verify failure**

Run: `cd gateway && node --test server.test.mjs`

Expected: FAIL because current `server.mjs` owns an in-memory `Map` and lacks M7 routes.

- [ ] **Step 3: Refactor `server.mjs` to transport-only request mapping**

Remove exported/global `tasks` state. Parse route/action, read JSON, pass the idempotency header and body to service methods, serialize public task/domain results.

- [ ] **Step 4: Implement stable domain-code to HTTP mapping**

Use: `404` task_not_found; `400` invalid_task/callback_not_configured malformed requests; `403` wrong_worker/wrong_poster; `409` task_exists/idempotency_conflict/task_not_bound/binding_conflict/chain_authoritative/chain_mismatch/settlement_not_confirmed/settlement_conflict/resume_not_ready; `503` chain_unavailable; unexpected errors `500 internal_error`.

- [ ] **Step 5: Wire default runtime dependencies and startup retry restoration**

When executed directly, initialize the store, call service `start()`, then listen. Tests inject the service and never touch the default devnet adapter unless explicitly testing wiring.

- [ ] **Step 6: Run HTTP tests and full suite**

Run: `cd gateway && node --test server.test.mjs && npm test`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add gateway/server.mjs gateway/server.test.mjs
git commit -m "refactor: make gateway http layer durable"
```

### Task 7: Seeded Resume Demo, CI Gate, and Public Contract

**Files:**
- Create: `gateway/demo.mjs`
- Create: `gateway/demo.test.mjs`
- Modify: `gateway/package.json`
- Modify: `.github/workflows/gateway-check.yml`
- Modify: `docs/openapi.yaml`
- Modify: `README.md`
- Modify: `docs/roadmap.md`
- Create: `docs/checkpoints/archive/2026-09-26-m7-agent-resume.md`
- Modify: `docs/checkpoints/CURRENT.md`

**Interfaces:**
- `gateway/demo.mjs` exports `runSeededResumeDemo()` and when run directly prints a concise proof summary.
- The demo uses a temporary state path, a local mock HTTP agent receiver, a fake mutable chain adapter, and the real store/service/callback transport modules.
- No demo dependency may require a private key, wallet, devnet RPC, or external service.

- [ ] **Step 1: Write the failing seeded end-to-end restart test**

In `gateway/demo.test.mjs`, assert the exact path: create blocked task -> bind fixture PDA/signature -> fake chain paid -> notify/sync -> callback receiver gets one `ground_relay.task.paid` event -> stop service -> recreate store/service from same file -> restore retries -> receiver still has exactly one event and no duplicate send.

- [ ] **Step 2: Run demo test and verify failure**

Run: `cd gateway && node --test demo.test.mjs`

Expected: FAIL because `demo.mjs` does not exist.

- [ ] **Step 3: Implement `runSeededResumeDemo()` and add `npm run demo`**

Use deterministic fixture addresses/signatures that are clearly labeled fake/local; do not reuse a real secret. Return a summary containing task ID, task PDA, settlement signature, callback count, event ID, and restart duplicate count.

- [ ] **Step 4: Run the runnable demo and deterministic test**

Run: `cd gateway && npm run demo && node --test demo.test.mjs`

Expected: demo prints `agent resumed`/equivalent proof and test PASS with callback count `1` after restart.

- [ ] **Step 5: Update OpenAPI to the tested M7 contract**

Document required `callbackUrl`, optional `Idempotency-Key`, chain-binding PUT, sync POST, paid reconciliation POST, resume retry POST, task chain/resume fields, and stable error responses. Keep server base path consistent with actual routes (`/v1/tasks`).

- [ ] **Step 6: Update CI and run the exact deterministic gate locally**

Ensure `.github/workflows/gateway-check.yml` performs `npm ci` then `npm test` in `gateway/`.

Run: `cd gateway && npm ci && npm test && npm run demo`

Expected: all Gateway tests PASS and seeded demo completes with one callback/no duplicate after restart.

- [ ] **Step 7: Update evaluator-facing docs only after verification evidence exists**

Update README/roadmap/checkpoint with verified M7 behavior, test/demo evidence, non-custodial trust boundary, and the precise semantics “one logical event, at-least-once HTTP until acknowledgement.” Mark M7 complete only after CI is green.

- [ ] **Step 8: Commit implementation docs and demo**

```bash
git add gateway/demo.mjs gateway/demo.test.mjs gateway/package.json .github/workflows/gateway-check.yml docs/openapi.yaml README.md docs/roadmap.md docs/checkpoints/archive/2026-09-26-m7-agent-resume.md docs/checkpoints/CURRENT.md
git commit -m "docs: prove M7 agent resume loop"
```

- [ ] **Step 9: Verify GitHub Actions before claiming completion**

Check the Gateway workflow for the final commit. Expected: dependency install PASS and all Gateway tests PASS. If CI differs from local results, diagnose the CI failure before marking M7 complete.

## Plan Self-Review Result

- Spec coverage: durable store, non-custodial binding, authoritative chain sync, create idempotency, settlement confirmation, deterministic event identity, HTTP classification, persisted backoff, startup recovery, manual retry, transport routes, seeded restart demo, CI, and documentation all map to explicit tasks.
- Type/interface consistency: store, chain, callback, service, scheduler, and server interfaces are defined once above the task that introduces them and reused by later tasks.
- Review Focus coverage: corrupt store (Task 1), account identity/decoder rejection (Task 2/4), duplicate PDA binding and stale-state regression (Task 4), timeout ambiguity/same event identity (Task 5).
- Scope: one cohesive subsystem (the existing Agent Gateway) with no hosted infrastructure or custodial signing added.
- Proportion: plan specifies interfaces, tests, commands, and fixed protocol values without embedding implementation bodies.