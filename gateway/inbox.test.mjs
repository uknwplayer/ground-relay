import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createRelayServer } from "./server.mjs";
import { createRelayService } from "./service.mjs";
import { createJsonStore } from "./store.mjs";

const PROGRAM_ID = "6v2peeoZVj2AXfczVLqyMUTHYt3XQPqAxCktpTwjUZap";

async function makeStore(prefix = "ground-relay-inbox-") {
  const dir = await mkdtemp(path.join(os.tmpdir(), prefix));
  const store = createJsonStore({ statePath: path.join(dir, "state.json") });
  await store.init();
  return store;
}

function deps(store, clock) {
  return {
    store,
    chain: { readTask: async () => { throw new Error("unused"); } },
    callbackTransport: async () => ({ classification: "delivered", statusCode: 200 }),
    clock,
    scheduler: { schedule: () => () => {} },
    allowLoopbackHttp: true,
    programId: PROGRAM_ID,
  };
}

function task(id) {
  return {
    id,
    title: `Task ${id}`,
    description: `Description ${id}`,
    poster: `Poster-${id}`,
    rewardAtomic: "1000000",
    rewardMint: `Mint-${id}`,
    callbackUrl: `http://127.0.0.1:9999/${id}`,
    criteria: [{ id: "photo", description: "Photo", required: true }],
  };
}

async function withServer(service, fn) {
  const server = createRelayServer({ service });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try { await fn(base); } finally { await new Promise((resolve) => server.close(resolve)); }
}

test("store listTasks returns detached snapshots", async () => {
  const store = await makeStore();
  await store.transaction((draft) => { draft.tasks.alpha = { id: "alpha", status: "open" }; });
  const listed = await store.listTasks();
  listed[0].status = "paid";
  assert.equal((await store.getTask("alpha")).status, "open");
});

test("service listTasks returns a worker-safe deterministic projection", async () => {
  const store = await makeStore();
  let now = Date.parse("2026-09-26T10:00:00.000Z");
  const service = createRelayService(deps(store, { now: () => now }));
  await service.createTask(task("older"));
  now = Date.parse("2026-09-26T11:00:00.000Z");
  await service.createTask(task("newer"));
  await store.transaction((draft) => {
    draft.tasks.newer.worker = "WorkerNew";
    draft.tasks.newer.evidenceHash = "ab".repeat(32);
    draft.tasks.newer.settlementSignature = "settlement-new";
    draft.tasks.newer.claimSignature = "private-claim-receipt";
    draft.tasks.newer.callbackUrl = "http://127.0.0.1:9999/secret-resume";
    draft.tasks.newer.resume = { eventId: "cd".repeat(32), idempotencyKey: "secret-idempotency-key", state: "retryable_failure", attempts: 3, autoRetriesUsed: 2, nextAttemptAt: "2026-09-26T12:00:00.000Z", lastError: "secret callback response" };
    draft.tasks.newer.chain = { cluster: "devnet", programId: PROGRAM_ID, taskPda: "TaskPdaNew", postSignature: "post-new", boundAt: "2026-09-26T11:00:01.000Z", lastSyncedAt: "2026-09-26T11:00:02.000Z" };
  });
  const listed = await service.listTasks();
  assert.deepEqual(listed.map((item) => item.id), ["newer", "older"]);
  assert.equal(listed[0].worker, "WorkerNew");
  assert.equal(listed[0].evidenceHash, "ab".repeat(32));
  assert.equal(listed[0].settlementSignature, "settlement-new");
  assert.deepEqual(listed[0].chain, { cluster: "devnet", programId: PROGRAM_ID, taskPda: "TaskPdaNew", postSignature: "post-new", lastSyncedAt: "2026-09-26T11:00:02.000Z" });
  assert.equal("callbackUrl" in listed[0], false);
  assert.equal("resume" in listed[0], false);
  assert.equal("claimSignature" in listed[0], false);
  assert.equal("boundAt" in listed[0].chain, false);
});

test("service listTasks breaks createdAt ties by task id", async () => {
  const store = await makeStore("ground-relay-inbox-tie-");
  const clock = { now: () => Date.parse("2026-09-26T12:00:00.000Z") };
  const service = createRelayService(deps(store, clock));
  await service.createTask(task("zeta"));
  await service.createTask(task("alpha"));
  assert.deepEqual((await service.listTasks()).map((item) => item.id), ["alpha", "zeta"]);
});

test("GET /v1/tasks returns the worker task collection", async () => {
  let calls = 0;
  const service = { listTasks: async () => { calls += 1; return [{ id: "task-a", title: "Task A", status: "open" }]; } };
  await withServer(service, async (base) => {
    const response = await fetch(`${base}/v1/tasks`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { tasks: [{ id: "task-a", title: "Task A", status: "open" }] });
  });
  assert.equal(calls, 1);
});
