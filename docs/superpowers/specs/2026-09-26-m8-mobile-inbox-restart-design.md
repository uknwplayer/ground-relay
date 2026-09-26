# M8 Mobile Task Inbox + Restart Restoration Design

**Date:** 2026-09-26  
**Branch:** `m8-product-hardening`  
**Stage:** M8 — Product hardening  
**Status:** Design approved in chat; implementation not started

## 1. Purpose

This slice moves Ground Relay from a single known demo fixture to a repeatable worker product flow that can discover real tasks, open a selected task, restore the same context after app restart, and reconcile that context against authoritative Solana state before enabling any state-changing action.

The intended worker flow is:

`Gateway task registry -> mobile inbox -> select bound task -> read selected task PDA on Solana -> reconcile -> claim / evidence / payout`

The design preserves the existing trust model:

- the Agent Gateway is the discovery/index layer for human-readable task metadata;
- the Ground Relay Anchor account on Solana is authoritative for execution state;
- the mobile app never treats locally persisted state as authoritative;
- the Gateway remains non-custodial and no signing secrets are added.

## 2. Goals

This slice must:

1. add a real worker task inbox backed by Gateway task data;
2. expose a worker-safe `GET /v1/tasks` list endpoint;
3. open a selected task by its durable Gateway ID and bound task PDA;
4. parameterize Solana reads/instructions so they target the selected task rather than the historical fixture;
5. persist safe mobile context across process restart;
6. restore the last selected task after restart;
7. reconcile restored/local state with Solana before actions are enabled;
8. fail safely when Gateway, storage, binding, or Solana data is unavailable or inconsistent;
9. preserve the canonical M5 fixture as historical proof only, never as an implicit new task.

## 3. Non-goals for this slice

The following remain M8 or later work and are explicitly out of scope here:

- geolocation or distance-ranked tasks;
- sophisticated filtering/search/pagination;
- push notifications;
- QR/deep-link handoff;
- evidence upload/storage service;
- complete receipt/history UX;
- task/vault rent reclamation;
- full callback/SSRF deployment hardening;
- broad evidence privacy redesign;
- mainnet deployment;
- major visual redesign.

The slice should establish the robust data and lifecycle foundation first.

## 4. Current constraints

The current mobile path starts from `demoTask` and then hydrates a single known on-chain fixture. The Solana client also uses hardcoded task, vault, reward mint, and worker-token addresses for that historical fixture.

That model is sufficient for a single controlled proof but cannot support a real task inbox or generic task execution.

The M7 Gateway already durably stores:

- task ID;
- title;
- description;
- poster;
- status snapshot;
- reward amount and mint;
- criteria;
- callback URL;
- optional expiry;
- chain binding with cluster, program ID, task PDA, post signature, and sync metadata;
- worker/evidence/settlement fields as they become known.

M8 should reuse that state instead of introducing another task registry.

## 5. Architecture decision

### 5.1 Discovery authority

The Gateway is the task discovery and metadata authority for the mobile inbox.

Rationale:

- it already owns the human-readable task metadata;
- it already persists external task ID <-> Solana task PDA binding;
- listing from the Gateway avoids expensive mobile program-account scans;
- the worker UI does not need callback transport metadata or agent retry state.

### 5.2 Execution authority

Solana remains authoritative for:

- task lifecycle status;
- assigned worker;
- reward mint and amount identity;
- evidence hash;
- whether claim/evidence/payout actions are legal.

The Gateway list may contain a recently observed status for display, but that status must never authorize a transaction.

### 5.3 Mobile persistence authority

AsyncStorage is only a restart convenience layer.

Persisted mobile state may restore navigation and a cached snapshot, but it cannot advance protocol state and cannot authorize an action without a fresh successful reconciliation against the selected on-chain account.

## 6. Gateway API design

### 6.1 New endpoint

Add:

`GET /v1/tasks`

Initial M8 scope does not require pagination. The implementation may return all currently persisted tasks because the reference service is single-process and intended for hackathon-scale/demo use.

### 6.2 Worker-safe projection

The endpoint must return a public worker projection, not raw internal task objects.

Each item should contain only fields required by the worker product:

```json
{
  "id": "external-task-id",
  "title": "Verify a storefront sign",
  "description": "...",
  "poster": "...",
  "status": "open",
  "worker": null,
  "rewardAtomic": "1000000",
  "rewardMint": "So111...",
  "createdAt": "2026-09-26T00:00:00.000Z",
  "expiresAt": 1234567890,
  "criteria": [
    {
      "id": "photo",
      "description": "Capture one clear photo",
      "required": true
    }
  ],
  "evidenceHash": null,
  "settlementSignature": null,
  "chain": {
    "cluster": "devnet",
    "programId": "6v2peeoZVj2AXfczVLqyMUTHYt3XQPqAxCktpTwjUZap",
    "taskPda": "...",
    "postSignature": "...",
    "lastSyncedAt": "..."
  }
}
```

Optional fields may be omitted rather than returned as `null`; the mobile parser must tolerate both when reasonable.

### 6.3 Fields that must not be exposed in the worker list

At minimum, omit:

- `callbackUrl`;
- resume payload/event metadata;
- callback attempt history;
- callback retry counters/timers;
- callback HTTP errors/responses;
- internal idempotency request hashes or store metadata.

### 6.4 Bound vs unbound tasks

Unbound Gateway tasks may appear in the inbox, but the mobile UI must mark them as unavailable for on-chain execution.

A task is executable only when it has a supported chain binding with:

- `cluster === "devnet"` for the current build;
- the expected Ground Relay program ID;
- a valid `taskPda`.

## 7. Mobile data model

Introduce explicit mobile-facing types rather than overloading the historical demo fixture.

### 7.1 `InboxTaskSummary`

Represents the Gateway worker projection required to render a list and select a task.

Expected fields:

- `id`;
- `title`;
- `description`;
- `poster`;
- `status` (Gateway-observed snapshot only);
- optional `worker`;
- `rewardAtomic`;
- `rewardMint`;
- `createdAt`;
- optional `expiresAt`;
- `criteria`;
- optional `evidenceHash`;
- optional `settlementSignature`;
- optional chain binding.

### 7.2 `SelectedTaskSession`

Represents safe context to persist across app restarts.

Suggested fields:

- `taskId`;
- optional `taskPda` copied from the selected Gateway binding;
- optional `claimSignature`;
- optional `deliverySignature`;
- optional `payoutSignature`;
- optional expected evidence hash needed to reconcile an ambiguous evidence submission;
- `updatedAt`.

Do not persist private keys, seed phrases, wallet authorization tokens, secrets, or hidden Gateway callback information.

### 7.3 `AuthoritativeTaskState`

Represents the selected Anchor task account decoded from Solana.

Expected fields are the existing on-chain fields:

- `taskIdHex`;
- `poster`;
- optional `worker`;
- `mint`;
- `rewardAtomic`;
- `expiresAt`;
- `status`;
- optional `evidenceHash`.

The task PDA used for the read is supplied by the selected binding rather than a global fixture constant.

## 8. Mobile storage design

Use the already-installed `@react-native-async-storage/async-storage` package.

Use one versioned root key:

`ground-relay/mobile-state/v1`

Suggested envelope:

```json
{
  "schemaVersion": 1,
  "savedAt": "...",
  "inboxSnapshot": [],
  "selectedTask": {}
}
```

### 8.1 Defensive parsing

Loading must fail safely:

- missing key -> clean state;
- invalid JSON -> discard local state and continue;
- wrong schema version -> discard local state and continue;
- structurally invalid selected task -> discard the invalid section;
- malformed inbox item -> reject or filter it deterministically rather than crash the app.

State corruption must never block app startup.

### 8.2 Persistence timing

Persist when:

- a fresh inbox load succeeds;
- the selected task changes;
- a transaction signature becomes known;
- evidence submission context needed for reconciliation changes;
- the selected task is explicitly cleared.

Do not persist a local protocol status as an independently authoritative state machine.

## 9. App navigation and startup flow

This slice needs only two conceptual screens; a navigation dependency is not required.

### 9.1 Inbox

Shows:

- task title;
- observed status;
- formatted reward;
- whether the task is bound/executable;
- optional stale/offline indicator when rendered from cached data.

Selecting a task opens Task Detail.

### 9.2 Task Detail

Shows task metadata immediately from the Gateway/cache, then performs Solana reconciliation when a valid binding exists.

State-changing actions remain disabled until reconciliation succeeds.

### 9.3 Startup sequence

1. initialize wallet/provider normally;
2. load `ground-relay/mobile-state/v1`;
3. render cached inbox if valid;
4. restore the previously selected task if still present/valid;
5. request a fresh `GET /v1/tasks`;
6. merge/replace the inbox snapshot with the fresh Gateway result;
7. if a task is selected and bound, fetch its selected task PDA from Solana;
8. reconcile authoritative fields into Task Detail;
9. enable legal actions only after successful reconciliation.

No transaction is replayed automatically during startup.

## 10. Reconciliation and authority rules

### 10.1 General rule

For bound tasks:

**Solana wins for protocol state.**

Examples:

- cached `open`, chain `claimed` -> show `claimed`;
- cached `claimed`, chain `paid` -> show `paid`;
- Gateway snapshot `delivered`, chain `accepted` -> show `accepted`;
- cached `paid`, chain `open` -> treat as a serious mismatch/error rather than regress the UI silently.

The mobile layer should reuse or extend existing monotonic transition/reconciliation logic where practical.

### 10.2 Gateway identity fields

Before enabling actions, verify that the selected on-chain account is consistent with the Gateway task/binding for the fields the program exposes:

- task ID when available/expected;
- poster;
- reward mint;
- reward amount.

A mismatch disables actions and surfaces a chain identity error.

### 10.3 Unbound task

An unbound task remains visible but read-only.

The UI should say that on-chain execution is not available yet rather than hiding the task or pretending it is claimable.

## 11. Solana client refactor

The historical fixture constants must not remain implicit execution defaults.

### 11.1 Reads

Change task reads from a zero-argument fixture read to an explicit address-based API, e.g. conceptually:

`fetchGroundRelayTask(rpc, taskPda)`

### 11.2 Claim and evidence instructions

Conceptually parameterize:

- `getClaimTaskInstruction(worker, taskPda)`;
- `getSubmitEvidenceInstruction(worker, taskPda, evidenceHash)`.

### 11.3 Payout instruction

Payout requires more than the task PDA. The selected task execution context must provide or deterministically derive the addresses required by the deployed Anchor instruction:

- task PDA;
- reward mint;
- vault PDA;
- worker token account;
- SPL Token program.

This slice must not silently reuse the historical fixture vault or worker token account for a different task.

Before implementation, the plan must identify the safest source/derivation for each payout account. If the current on-chain account layout does not contain enough information to derive a generic vault/worker token account safely, the payout UI may remain disabled for generic tasks until the required account derivation is proven. Claim/evidence/inbox/restart work must not be blocked by a speculative payout shortcut.

## 12. Gateway client design

Add a small isolated mobile client module responsible for:

- resolving the configured Gateway base URL;
- `GET /v1/tasks`;
- parsing/validating the worker projection;
- returning typed errors for offline/unavailable/invalid-response states.

Do not put HTTP parsing directly in `App.tsx`.

For this hackathon slice, the Gateway URL may be configured through the existing app configuration/environment pattern; it must not be a private credential.

## 13. Error and recovery behavior

### 13.1 Gateway unavailable

If a valid cached inbox exists:

- render it;
- clearly mark it as cached/offline;
- keep previously selected metadata readable.

If no cache exists:

- show an inbox unavailable/empty state with retry.

Gateway unavailability alone must not authorize on-chain actions from stale state.

### 13.2 Solana unavailable

- keep task metadata visible;
- show the on-chain state as unavailable/stale;
- disable claim/evidence/payout buttons;
- allow manual refresh.

### 13.3 Invalid/missing binding

- task remains visible;
- show `Not yet executable on-chain` (or equivalent);
- disable protocol actions.

### 13.4 Local storage corruption

- discard invalid local data;
- continue to a clean startup;
- fetch fresh Gateway data when available;
- do not crash.

### 13.5 Identity mismatch

If Solana data does not match the selected Gateway task/binding:

- do not mutate local state into the mismatched chain state;
- disable actions;
- surface a clear `chain_mismatch`-style error;
- require a fresh Gateway/chain refresh before recovery.

## 14. Component/module boundaries

Expected changes are intentionally small and isolated.

### Gateway

- `gateway/service.mjs`
  - add `listTasks()` returning worker-safe projections;
- `gateway/server.mjs`
  - add `GET /v1/tasks` before task-ID route parsing;
- `gateway/service.test.mjs`
  - projection, ordering, and leak-prevention tests;
- `gateway/server.test.mjs`
  - HTTP route and status tests;
- `docs/openapi.yaml`
  - document worker list route and response schema.

### Mobile

- `src/inbox/types.ts`
  - Gateway/inbox/session types;
- `src/inbox/api.ts`
  - Gateway list client + validation;
- `src/inbox/storage.ts`
  - AsyncStorage serialization, schema validation, safe fallback;
- `src/solana/ground-relay.ts`
  - remove fixture-only execution assumptions from generic APIs;
- `src/solana/reconcile.ts`
  - extend only if selected-task reconciliation needs a pure helper;
- `App.tsx`
  - coordinate Inbox and Task Detail views, restored state, refresh, and action gating.

If `App.tsx` becomes harder to reason about during implementation, split presentation components under `src/inbox/` or `src/screens/`; do not perform unrelated UI refactoring.

## 15. Sorting and list semantics

For deterministic first implementation:

- sort by `createdAt` descending;
- no filtering beyond rendering all persisted Gateway tasks;
- tasks in terminal states remain visible so the same endpoint can later support history;
- the UI may visually separate active and terminal tasks if trivial, but a dedicated history screen is not part of this slice.

This preserves data useful for the next M8 history slice without introducing a second API.

## 16. Security and privacy constraints

The implementation must preserve these properties:

- no wallet private keys or seeds in Gateway/mobile storage;
- no callback URLs in worker inbox responses;
- no internal callback retry/error metadata in worker responses;
- no local cached status can authorize a transaction;
- no automatic transaction replay after restart;
- no implicit use of the canonical historical fixture for another task;
- no mainnet behavior introduced;
- evidence image contents remain off-chain as in the current design; this slice does not add remote evidence storage.

## 17. Testing requirements

### 17.1 Gateway

Add tests proving:

1. multiple tasks are returned;
2. sorting is deterministic (`createdAt` descending);
3. unbound and bound tasks are represented correctly;
4. `callbackUrl` is not present;
5. resume/callback retry metadata is not present;
6. `GET /v1/tasks` returns `200` with the worker projection.

### 17.2 Mobile pure logic/storage

Add Node-testable pure modules where possible proving:

1. valid inbox response parses;
2. malformed response fails safely;
3. storage round-trip preserves selected task/session metadata;
4. corrupt JSON returns clean default state;
5. unsupported schema version returns clean default state;
6. cached `open` + chain `claimed` resolves to `claimed`;
7. cached `claimed` + chain `paid` resolves to `paid`;
8. identity mismatch disables/blocks action eligibility;
9. an unbound task is not executable;
10. address-building helpers use the selected task context rather than fixture constants.

### 17.3 Regression requirement

There must be an explicit regression test that fails if a generic task operation accidentally targets the canonical historical task PDA:

`7knPNeaZHDn7qVzdGy6Qbq3tWnHMnP2TpHULwLKzVtpT`

unless that exact task was selected intentionally.

### 17.4 CI

The slice must finish with:

- root Node regression tests passing;
- TypeScript typecheck passing;
- Gateway `npm test` passing;
- Gateway seeded demo still passing;
- Android build workflow remaining compatible.

No devnet identity bootstrap or program redeployment is required for this slice.

## 18. Manual acceptance scenario

The target manual proof is:

1. Gateway contains at least two tasks;
2. mobile launches and displays both in Inbox;
3. at least one task is bound to a valid devnet task PDA;
4. worker opens that task;
5. app fetches that exact PDA and displays authoritative status;
6. worker closes/kills the app;
7. app restarts;
8. cached inbox and the same selected task appear without reverting to `demoTask`;
9. fresh Gateway refresh completes;
10. fresh Solana reconciliation completes;
11. UI reflects chain truth even if cached status was stale;
12. allowed transaction builders target the selected task context only.

A physical transaction is optional for the first automated implementation checkpoint, but before M8 is considered complete the generic selected-task path should be exercised on a real devnet task that is not merely the canonical paid fixture.

## 19. Migration from the historical fixture

The canonical M5 fixture remains immutable historical evidence.

Implementation rules:

- keep its addresses in proof docs/checkpoints;
- remove it as the mobile app's implicit startup task;
- do not reset or recreate that task as `OPEN`;
- do not reuse its vault/token-account addresses for unrelated tasks;
- demo-only metadata may remain in a clearly named fixture/test module only when explicitly used by tests or documentation.

## 20. Exit condition for this slice

This slice is complete when the following is reproducibly demonstrated:

`Gateway has 2+ tasks -> mobile shows real inbox -> worker selects one bound task -> app reads that exact Solana task PDA -> app is closed -> app restarts into the same context -> Gateway refresh runs -> Solana reconciliation runs -> UI reflects authoritative chain state -> actions remain disabled until authoritative validation -> transaction builders use only the selected task context`

The implementation must also prove that corrupted local storage and unavailable Gateway/Solana dependencies fail closed without false protocol progression.

## 21. Follow-on M8 work

After this slice, the recommended order remains:

1. receipt/history screen using the same task registry;
2. deeper app recovery states and fresh-device repeatability;
3. callback/SSRF deployment hardening;
4. evidence privacy review;
5. account/payment security review;
6. terminal task/vault rent reclamation policy;
7. remove or label remaining demo-only behavior;
8. proceed to M9 release/submission work only after repeatable M8 completion.
