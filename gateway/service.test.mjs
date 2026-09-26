import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createJsonStore } from "./store.mjs";
import { createRelayService } from "./service.mjs";

const PROGRAM_ID = "6v2peeoZVj2AXfczVLqyMUTHYt3XQPqAxCktpTwjUZap";

async function makeStore() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "ground-relay-service-"));
  const statePath = path.join(dir, "state.json");
  const store = createJsonStore({ statePath });
  await store.init();
  return { store, statePath };
}

function baseTask(overrides = {}) {
  return {
    id: "task-a",
    title: "Verify sign",
    description: "Human visual check",
    poster: "Poster1111111111111111111111111111111111",
    rewardAtomic: "1000000",
    rewardMint: "Mint111111111111111111111111111111111111",
    callbackUrl: "http://127.0.0.1:9999/resume",
    criteria: [{ id: "photo", description: "Photo", required: true }],
    ...overrides,
  };
}

function deps(store, overrides = {}) {
  return {
    store,
    chain: { readTask: async () => { throw new Error("unused"); } },
    callbackTransport: async () => ({ classification: "delivered", statusCode: 200 }),
    clock: { now: () => Date.parse("2026-09-26T02:00:00.000Z") },
    scheduler: { schedule: () => () => {} },
    allowLoopbackHttp: true,
    programId: PROGRAM_ID,
    ...overrides,
  };
}

test("service create requires callback and persists task", async () => {
  const { store } = await makeStore();
  const service = createRelayService(deps(store));
  await assert.rejects(() => service.createTask(baseTask({ callbackUrl: undefined })), (error) => error.code === "invalid_task");
  const created = await service.createTask(baseTask());
  assert.equal(created.id, "task-a");
  assert.equal(created.status, "open");
  assert.equal((await store.getTask("task-a")).title, "Verify sign");
});

test("service create idempotency returns original for same request and conflicts for different request", async () => {
  const { store } = await makeStore();
  const service = createRelayService(deps(store));
  const first = await service.createTask(baseTask(), { idempotencyKey: "create-1" });
  const second = await service.createTask({ ...baseTask(), criteria: [{ required: true, description: "Photo", id: "photo" }] }, { idempotencyKey: "create-1" });
  assert.deepEqual(second, first);
  await assert.rejects(
    () => service.createTask(baseTask({ title: "Different" }), { idempotencyKey: "create-1" }),
    (error) => error.code === "idempotency_conflict",
  );
});

test("service restart preserves task and idempotency record", async () => {
  const { store, statePath } = await makeStore();
  const firstService = createRelayService(deps(store));
  await firstService.createTask(baseTask(), { idempotencyKey: "create-restart" });
  const reloadedStore = createJsonStore({ statePath });
  await reloadedStore.init();
  const secondService = createRelayService(deps(reloadedStore));
  assert.equal((await secondService.getTask("task-a")).status, "open");
  const repeated = await secondService.createTask(baseTask(), { idempotencyKey: "create-restart" });
  assert.equal(repeated.id, "task-a");
});

function chainTask(overrides = {}) {
  return {
    taskPda: "TaskPdaA",
    taskIdHex: "11".repeat(32),
    poster: baseTask().poster,
    mint: baseTask().rewardMint,
    rewardAtomic: baseTask().rewardAtomic,
    status: "open",
    expiresAt: 2_000_000_000,
    ...overrides,
  };
}

const binding = {
  cluster: "devnet",
  programId: PROGRAM_ID,
  taskPda: "TaskPdaA",
  postSignature: "post-signature-a",
};

test("service binding validates chain identity then persists and exact repeat is idempotent", async () => {
  const { store } = await makeStore();
  let reads = 0;
  const chain = { readTask: async (taskPda) => { reads += 1; assert.equal(taskPda, binding.taskPda); return chainTask(); } };
  const service = createRelayService(deps(store, { chain }));
  await service.createTask(baseTask());
  const first = await service.bindTask("task-a", binding);
  assert.equal(first.chain.taskPda, binding.taskPda);
  assert.equal(first.chain.postSignature, binding.postSignature);
  assert.equal(reads, 1);
  const before = await store.getTask("task-a");
  const second = await service.bindTask("task-a", binding);
  assert.deepEqual(second, before);
  assert.equal(reads, 1);
});

test("service binding rejects conflict and failed validation never persists", async () => {
  const { store } = await makeStore();
  let current = chainTask();
  const service = createRelayService(deps(store, { chain: { readTask: async () => current } }));
  await service.createTask(baseTask());
  current = chainTask({ poster: "WrongPoster" });
  await assert.rejects(() => service.bindTask("task-a", binding), (error) => error.code === "chain_mismatch");
  assert.equal((await store.getTask("task-a")).chain, undefined);
  current = chainTask();
  await service.bindTask("task-a", binding);
  await assert.rejects(
    () => service.bindTask("task-a", { ...binding, postSignature: "different" }),
    (error) => error.code === "binding_conflict",
  );
});

test("service binding rejects duplicate task PDA across external task IDs", async () => {
  const { store } = await makeStore();
  const chain = { readTask: async () => chainTask() };
  const service = createRelayService(deps(store, { chain }));
  await service.createTask(baseTask());
  await service.createTask(baseTask({ id: "task-b" }));
  await service.bindTask("task-a", binding);
  await assert.rejects(
    () => service.bindTask("task-b", { ...binding, postSignature: "post-signature-b" }),
    (error) => error.code === "binding_conflict",
  );
});

test("service binding rejects wrong cluster program mint and reward", async () => {
  const cases = [
    [{ ...binding, cluster: "mainnet-beta" }, chainTask(), "binding_conflict"],
    [{ ...binding, programId: "WrongProgram" }, chainTask(), "binding_conflict"],
    [binding, chainTask({ mint: "WrongMint" }), "chain_mismatch"],
    [binding, chainTask({ rewardAtomic: "999" }), "chain_mismatch"],
  ];
  for (const [candidate, chainValue, code] of cases) {
    const { store } = await makeStore();
    const service = createRelayService(deps(store, { chain: { readTask: async () => chainValue } }));
    await service.createTask(baseTask());
    await assert.rejects(() => service.bindTask("task-a", candidate), (error) => error.code === code);
    assert.equal((await store.getTask("task-a")).chain, undefined);
  }
});

test("service sync rejects unbound tasks and RPC failures without mutation", async () => {
  const { store } = await makeStore();
  const service = createRelayService(deps(store));
  await service.createTask(baseTask());
  await assert.rejects(() => service.syncTask("task-a"), (error) => error.code === "task_not_bound");
  let current = chainTask();
  const boundService = createRelayService(deps(store, { chain: { readTask: async () => current } }));
  await boundService.bindTask("task-a", binding);
  const before = await store.getTask("task-a");
  current = new Error("rpc offline");
  const failingService = createRelayService(deps(store, { chain: { readTask: async () => { throw current; } } }));
  await assert.rejects(() => failingService.syncTask("task-a"), (error) => error.code === "chain_unavailable");
  assert.deepEqual(await store.getTask("task-a"), before);
});

test("service sync takes worker status and evidence from chain without stale regression", async () => {
  const { store } = await makeStore();
  let current = chainTask();
  const service = createRelayService(deps(store, { chain: { readTask: async () => current } }));
  await service.createTask(baseTask());
  await service.bindTask("task-a", binding);
  current = chainTask({ status: "claimed", worker: "WorkerA" });
  let synced = await service.syncTask("task-a");
  assert.equal(synced.status, "claimed");
  assert.equal(synced.worker, "WorkerA");
  current = chainTask({ status: "open" });
  synced = await service.syncTask("task-a");
  assert.equal(synced.status, "claimed");
  assert.equal(synced.worker, "WorkerA");
  current = chainTask({ status: "delivered", worker: "WorkerA", evidenceHash: "cd".repeat(32) });
  synced = await service.syncTask("task-a");
  assert.equal(synced.status, "delivered");
  assert.equal(synced.evidenceHash, "cd".repeat(32));
});

test("service sync rejects chain identity mismatch without corruption", async () => {
  const { store } = await makeStore();
  let current = chainTask();
  const service = createRelayService(deps(store, { chain: { readTask: async () => current } }));
  await service.createTask(baseTask());
  await service.bindTask("task-a", binding);
  const before = await store.getTask("task-a");
  current = chainTask({ mint: "OtherMint" });
  await assert.rejects(() => service.syncTask("task-a"), (error) => error.code === "chain_mismatch");
  assert.deepEqual(await store.getTask("task-a"), before);
});

test("service sync keeps paid and cancelled terminal and does not invent settlement signature", async () => {
  const { store } = await makeStore();
  let current = chainTask();
  const service = createRelayService(deps(store, { chain: { readTask: async () => current } }));
  await service.createTask(baseTask());
  await service.bindTask("task-a", binding);
  current = chainTask({ status: "paid", worker: "WorkerA", evidenceHash: "ef".repeat(32) });
  let synced = await service.syncTask("task-a");
  assert.equal(synced.status, "paid");
  assert.equal(synced.settlementSignature, undefined);
  current = chainTask({ status: "accepted", worker: "WorkerA", evidenceHash: "ef".repeat(32) });
  synced = await service.syncTask("task-a");
  assert.equal(synced.status, "paid");
  const { store: cancelStore } = await makeStore();
  let cancelCurrent = chainTask();
  const cancelService = createRelayService(deps(cancelStore, { chain: { readTask: async () => cancelCurrent } }));
  await cancelService.createTask(baseTask());
  await cancelService.bindTask("task-a", binding);
  cancelCurrent = chainTask({ status: "cancelled" });
  let cancelled = await cancelService.syncTask("task-a");
  assert.equal(cancelled.status, "cancelled");
  cancelCurrent = chainTask({ status: "open" });
  cancelled = await cancelService.syncTask("task-a");
  assert.equal(cancelled.status, "cancelled");
});

test("service legacy local lifecycle remains available only while unbound", async () => {
  const { store } = await makeStore();
  const service = createRelayService(deps(store));
  await service.createTask(baseTask());
  let task = await service.claimLocal("task-a", { worker: "worker-a", signature: "claim-sig" });
  assert.equal(task.status, "claimed");
  await assert.rejects(
    () => service.deliverLocal("task-a", { worker: "worker-b", bundleHash: "aa".repeat(32) }),
    (error) => error.code === "wrong_worker",
  );
  task = await service.deliverLocal("task-a", { worker: "worker-a", bundleHash: "aa".repeat(32), signature: "delivery-sig" });
  assert.equal(task.status, "delivered");
  assert.equal(task.evidenceHash, "aa".repeat(32));
  await assert.rejects(
    () => service.verifyLocal("task-a", { poster: "wrong", accepted: true }),
    (error) => error.code === "wrong_poster",
  );
  task = await service.verifyLocal("task-a", { poster: baseTask().poster, accepted: true });
  assert.equal(task.status, "accepted");
});

test("service bound task rejects legacy local mutations as chain authoritative", async () => {
  const { store } = await makeStore();
  const service = createRelayService(deps(store, { chain: { readTask: async () => chainTask() } }));
  await service.createTask(baseTask());
  await service.bindTask("task-a", binding);
  for (const action of [
    () => service.claimLocal("task-a", { worker: "worker-a" }),
    () => service.deliverLocal("task-a", { worker: "worker-a", bundleHash: "aa".repeat(32) }),
    () => service.verifyLocal("task-a", { poster: baseTask().poster, accepted: true }),
  ]) {
    await assert.rejects(action, (error) => error.code === "chain_authoritative");
  }
});
