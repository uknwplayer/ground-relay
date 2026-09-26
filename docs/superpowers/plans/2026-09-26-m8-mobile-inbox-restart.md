# M8 Mobile Task Inbox + Restart Restoration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the mobile app's single historical fixture startup path with a real Gateway-backed task inbox that restores safely after restart and enables Solana actions only after authoritative reconciliation of the selected task PDA.

**Architecture:** The Gateway is the discovery/index layer and exposes a worker-safe task projection; Solana remains authoritative for protocol state and action eligibility. The mobile app caches only safe UI/session context in versioned AsyncStorage, restores it at startup, refreshes the Gateway, then reconciles the selected task against its bound Solana PDA before enabling any state-changing action.

**Tech Stack:** React Native / Expo 57, React 19, TypeScript, `@wallet-ui/react-native-kit`, `@solana/kit`, `@react-native-async-storage/async-storage`, Node 22 `node:test`, Node HTTP Gateway.

**Spec:** `docs/superpowers/specs/2026-09-26-m8-mobile-inbox-restart-design.md`

## Global Constraints

- Work only on `m8-product-hardening`; do not deploy or authorize mainnet.
- Do not rerun devnet identity bootstrap, regenerate the program keypair, or overwrite deployment Secrets.
- Preserve program ID `6v2peeoZVj2AXfczVLqyMUTHYt3XQPqAxCktpTwjUZap`.
- The canonical M5 task PDA `7knPNeaZHDn7qVzdGy6Qbq3tWnHMnP2TpHULwLKzVtpT` is historical proof only and must never be an implicit execution default.
- Gateway discovery metadata may be cached; only a fresh successful Solana read may authorize claim/evidence/payout actions.
- Persist no wallet private key, seed phrase, auth token, callback URL, or callback retry internals on the worker surface.
- Startup/restart must never replay a transaction automatically.
- Generic payout is **fail-closed in this slice**: the transaction builder must require an explicit `PayoutExecutionContext` containing every account address. The app must not synthesize one from historical fixture constants. Enabling generic payout derivation is follow-on work unless a separately reviewed derivation proof is added.
- No new navigation library or database dependency for this slice.
- Gateway list order is deterministic: `createdAt` descending, then `id` ascending as a tie-break.

## Review Focus

1. **Gateway projection leakage:** raw `callbackUrl`, resume event data, retry counters/timers, HTTP response/error metadata, and idempotency hashes must never appear in `GET /v1/tasks`.
2. **Stale local authority:** cached `open` or `claimed` state must never enable an action until a fresh selected-PDA chain read succeeds and identity fields match.
3. **Address confusion:** selecting task B must make every generic read/claim/evidence builder use task B's PDA; no fallback to the canonical M5 PDA is allowed.
4. **Corrupt/offline startup:** malformed AsyncStorage, unsupported schema, Gateway outage, or Solana outage must degrade to read-only/clean state without crash or false protocol progression.
5. **Terminal/regressive chain observations:** a cached/observed terminal state must not silently regress; impossible identity/status observations disable actions and surface mismatch.

---

### Task 1: Gateway Worker Inbox Projection

**Files:**
- Modify: `gateway/store.mjs`
- Modify: `gateway/store.test.mjs`
- Modify: `gateway/service.mjs`
- Modify: `gateway/service.test.mjs`
- Modify: `gateway/server.mjs`
- Modify: `gateway/server.test.mjs`
- Modify: `docs/openapi.yaml`

**Interfaces:**
- Produces: `store.listTasks(): Promise<object[]>`
- Produces: `service.listTasks(): Promise<WorkerTaskSummary[]>`
- Produces: `GET /v1/tasks -> 200 { tasks: WorkerTaskSummary[] }`
- `WorkerTaskSummary` contains only `id`, `title`, `description`, `poster`, `status`, optional `worker`, `rewardAtomic`, `rewardMint`, `createdAt`, optional `expiresAt`, `criteria`, optional `evidenceHash`, optional `settlementSignature`, and optional public `chain` binding fields.

- [ ] **Step 1: Add failing store tests for listing without mutation**
- [ ] **Step 2: Run `cd gateway && node --test store.test.mjs` and verify RED**
- [ ] **Step 3: Implement `store.listTasks()` with structured clones**
- [ ] **Step 4: Add failing service projection tests for ordering, bound/unbound tasks, and leak prevention**
- [ ] **Step 5: Run `cd gateway && node --test service.test.mjs` and verify RED**
- [ ] **Step 6: Implement `service.listTasks()` using an explicit allow-list**
- [ ] **Step 7: Add failing HTTP test for `GET /v1/tasks`**
- [ ] **Step 8: Run `cd gateway && node --test server.test.mjs` and verify RED**
- [ ] **Step 9: Implement collection route before task-ID parsing**
- [ ] **Step 10: Document the worker response in OpenAPI**
- [ ] **Step 11: Run `cd gateway && npm test && npm run demo`**
- [ ] **Step 12: Commit `feat: add worker-safe task inbox endpoint`**

---

### Task 2: Typed Mobile Inbox Client

**Files:**
- Create: `src/inbox/types.ts`
- Create: `src/inbox/api.ts`
- Create: `src/inbox/config.ts`
- Create: `test/inbox-api.test.mjs`

**Interfaces:**
- Produces: `TaskChainBinding`, `InboxTaskSummary`, `SelectedTaskSession`, `MobileStateV1`.
- Produces: `parseInboxResponse(input: unknown): InboxTaskSummary[]`.
- Produces: `fetchTaskInbox(baseUrl: string, fetchImpl?: typeof fetch): Promise<InboxTaskSummary[]>`.
- Produces: `resolveGatewayBaseUrl(value?: string): string | undefined`, using `EXPO_PUBLIC_GROUND_RELAY_GATEWAY_URL`.

- [ ] **Step 1: Write failing parser/client tests**
- [ ] **Step 2: Run `node --test test/inbox-api.test.mjs` and verify RED**
- [ ] **Step 3: Define inbox/session types**
- [ ] **Step 4: Implement strict `parseInboxResponse()`**
- [ ] **Step 5: Implement `fetchTaskInbox()` and Gateway URL resolution**
- [ ] **Step 6: Run `node --test test/inbox-api.test.mjs && npm run typecheck`**
- [ ] **Step 7: Commit `feat: add typed mobile task inbox client`**

---

### Task 3: Versioned Restart-Safe Mobile State

**Files:**
- Create: `src/inbox/state.ts`
- Create: `src/inbox/storage.ts`
- Create: `test/inbox-state.test.mjs`

**Interfaces:**
- Produces: `MOBILE_STATE_KEY = "ground-relay/mobile-state/v1"`.
- Produces: `emptyMobileState(): MobileStateV1`.
- Produces: `parseMobileState(raw: string | null): MobileStateV1`.
- Produces: `serializeMobileState(state: MobileStateV1): string`.
- Produces: `loadMobileState(storage = AsyncStorage): Promise<MobileStateV1>` and `saveMobileState(state, storage = AsyncStorage): Promise<void>`.

- [ ] **Step 1: Write failing pure state tests**
- [ ] **Step 2: Run `node --test test/inbox-state.test.mjs` and verify RED**
- [ ] **Step 3: Implement pure parser/serializer with `schemaVersion: 1`**
- [ ] **Step 4: Implement thin AsyncStorage adapter**
- [ ] **Step 5: Add adapter tests using injected in-memory storage**
- [ ] **Step 6: Run `node --test test/inbox-state.test.mjs && npm run typecheck`**
- [ ] **Step 7: Commit `feat: persist restart-safe mobile task context`**

---

### Task 4: Selected-Task Solana Addressing, No Fixture Fallback

**Files:**
- Modify: `src/solana/ground-relay.ts`
- Create: `test/selected-task-solana.test.mjs`
- Modify: existing Solana/reconciliation tests that call old signatures.

**Interfaces:**
- Produces: `fetchGroundRelayTask(rpc, taskPda: string): Promise<OnChainRelayTask>`.
- Produces: `getClaimTaskInstruction(worker: string, taskPda: string): Instruction`.
- Produces: `getSubmitEvidenceInstruction(worker: string, taskPda: string, evidenceHash: string): Instruction`.
- Produces: `PayoutExecutionContext = { taskPda: string; rewardMint: string; vaultPda: string; workerTokenAddress: string }`.
- Produces: `getReleasePaymentInstruction(worker: string, context: PayoutExecutionContext): Instruction`.
- No generic API may substitute canonical fixture addresses when an address is omitted.

- [ ] **Step 1: Write canonical anti-regression test using two synthetic task PDAs**
- [ ] **Step 2: Add payout fail-closed tests with explicit `PayoutExecutionContext`**
- [ ] **Step 3: Run focused tests and verify RED**
- [ ] **Step 4: Parameterize reader and transaction builders**
- [ ] **Step 5: Update existing call-site tests without weakening MWA reconciliation**
- [ ] **Step 6: Run `npm test && npm run typecheck`**
- [ ] **Step 7: Commit `refactor: target explicit selected Solana task accounts`**

---

### Task 5: Authoritative Selected-Task Reconciliation and Action Gating

**Files:**
- Create: `src/inbox/reconcile.ts`
- Create: `test/inbox-reconcile.test.mjs`
- Modify: `src/solana/reconcile.ts` only if a shared helper is genuinely reusable.

**Interfaces:**
- Produces: `reconcileSelectedTask(summary: InboxTaskSummary, onChain: OnChainRelayTask): ReconciledTaskState`.
- Produces: `deriveActionEligibility({ summary, authoritative, walletAddress, hasCapturedEvidence, payoutContext }): { canClaim; canCapture; canSubmit; canRelease }`.

- [ ] **Step 1: Write failing reconciliation tests**
- [ ] **Step 2: Write failing action-gating tests**
- [ ] **Step 3: Run `node --test test/inbox-reconcile.test.mjs` and verify RED**
- [ ] **Step 4: Implement identity validation and authoritative projection**
- [ ] **Step 5: Implement action gating; `canRelease` requires explicit payout context**
- [ ] **Step 6: Run focused tests and typecheck**
- [ ] **Step 7: Commit `feat: reconcile selected tasks against Solana authority`**

---

### Task 6: Mobile Inbox, Detail, and Restart Orchestration

**Files:**
- Modify: `App.tsx`
- Optionally create: `src/inbox/InboxView.tsx`
- Optionally create: `src/inbox/TaskDetailView.tsx`
- Create: `test/inbox-flow.test.mjs`

**Startup order:** load cache -> render cache -> fetch Gateway -> restore/validate selected task -> selected-PDA Solana read -> reconcile -> enable legal actions.

- [ ] **Step 1: Write failing pure flow regression with two Gateway tasks**
- [ ] **Step 2: Run `node --test test/inbox-flow.test.mjs` and verify RED**
- [ ] **Step 3: Remove `demoTask` as startup owner**
- [ ] **Step 4: Implement Inbox rendering and selection**
- [ ] **Step 5: Implement selected-PDA authoritative refresh**
- [ ] **Step 6: Wire claim/evidence builders to selected PDA**
- [ ] **Step 7: Keep generic payout disabled without explicit verified payout context**
- [ ] **Step 8: Persist safe session changes**
- [ ] **Step 9: Prove restart does not replay transactions**
- [ ] **Step 10: Run `npm test && npm run typecheck`**
- [ ] **Step 11: Commit `feat: add restart-safe real task inbox flow`**

---

### Task 7: Contract, CI, Checkpoint, and End-to-End Deterministic Proof

**Files:**
- Modify: `.github/workflows/*` only if path filters need new M8 files.
- Modify: `README.md`
- Modify: `docs/roadmap.md`
- Modify: `docs/checkpoints/CURRENT.md`
- Create: `docs/checkpoints/archive/2026-09-26-m8-inbox-restart.md`
- Modify: `docs/openapi.yaml` only for final consistency fixes.

- [ ] **Step 1: Run `npm test && npm run typecheck`**
- [ ] **Step 2: Run `cd gateway && npm ci && npm test && npm run demo`**
- [ ] **Step 3: Run canonical-address regression explicitly**
- [ ] **Step 4: Verify actual mobile/Android CI workflow result; do not infer build success from typecheck**
- [ ] **Step 5: Update README/roadmap/checkpoint, marking only completed M8 items**
- [ ] **Step 6: Write M8 slice proof checkpoint with CI IDs, test counts, two-task selected-PDA proof, restart proof, offline fail-closed behavior, and generic payout limitation**
- [ ] **Step 7: Whole-branch diff review against the spec**
- [ ] **Step 8: Commit `docs: record M8 inbox and restart proof`**
- [ ] **Step 9: Stop before merge; PR only after fresh branch verification**

## Execution Notes

- Implement tasks in order; Tasks 2-5 establish interfaces used by Task 6.
- Use RED -> GREEN TDD for every task. Do not bundle unrelated refactors.
- Do not create a new real devnet fixture merely to make automated tests pass.
- Generic payout enablement is deliberately not part of this first slice. The builder becomes explicit-address-only now so a future derivation proof can be added safely without another fixture-removal refactor.
- Before M8 as a whole is declared complete, exercise the generic selected-task path on a real non-canonical devnet task.
