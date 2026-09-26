import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createJsonStore } from "./store.mjs";

async function tempState() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "ground-relay-store-"));
  return path.join(dir, "state.json");
}

test("store initializes missing state and reloads persisted task", async () => {
  const statePath = await tempState();
  const store = createJsonStore({ statePath });
  assert.deepEqual(await store.init(), { schemaVersion: 1, tasks: {}, idempotency: {} });
  await store.transaction((draft) => {
    draft.tasks.alpha = { id: "alpha", status: "open" };
  });
  const reloaded = createJsonStore({ statePath });
  await reloaded.init();
  assert.deepEqual(await reloaded.getTask("alpha"), { id: "alpha", status: "open" });
});

test("store rejects corrupt JSON without replacing bytes", async () => {
  const statePath = await tempState();
  await writeFile(statePath, "{broken", "utf8");
  const store = createJsonStore({ statePath });
  await assert.rejects(() => store.init());
  assert.equal(await readFile(statePath, "utf8"), "{broken");
});

test("store rejects unsupported schema", async () => {
  const statePath = await tempState();
  await writeFile(statePath, JSON.stringify({ schemaVersion: 2, tasks: {}, idempotency: {} }), "utf8");
  const store = createJsonStore({ statePath });
  await assert.rejects(() => store.init(), /schemaVersion/);
});

test("throwing transaction rolls back persisted state", async () => {
  const statePath = await tempState();
  const store = createJsonStore({ statePath });
  await store.init();
  await store.transaction((draft) => { draft.tasks.keep = { id: "keep" }; });
  await assert.rejects(() => store.transaction((draft) => {
    draft.tasks.bad = { id: "bad" };
    throw new Error("boom");
  }), /boom/);
  const reloaded = createJsonStore({ statePath });
  await reloaded.init();
  assert.deepEqual(await reloaded.listTasks(), [{ id: "keep" }]);
});

test("concurrent transactions serialize without lost updates", async () => {
  const statePath = await tempState();
  const store = createJsonStore({ statePath });
  await store.init();
  await store.transaction((draft) => { draft.tasks.counter = { id: "counter", value: 0 }; });
  await Promise.all(Array.from({ length: 20 }, () => store.transaction(async (draft) => {
    const before = draft.tasks.counter.value;
    await new Promise((resolve) => setTimeout(resolve, 1));
    draft.tasks.counter.value = before + 1;
  })));
  assert.equal((await store.getTask("counter")).value, 20);
});

test("idempotency and retry metadata survive reload", async () => {
  const statePath = await tempState();
  const store = createJsonStore({ statePath });
  await store.init();
  await store.transaction((draft) => {
    draft.idempotency.create1 = { requestHash: "abc", taskId: "task-1" };
    draft.tasks["task-1"] = { id: "task-1", resume: { state: "retryable_failure", attempts: 2, nextAttemptAt: "2026-09-26T01:00:00.000Z" } };
  });
  const reloaded = createJsonStore({ statePath });
  await reloaded.init();
  assert.deepEqual(await reloaded.getIdempotency("create1"), { requestHash: "abc", taskId: "task-1" });
  assert.equal((await reloaded.getTask("task-1")).resume.attempts, 2);
});
