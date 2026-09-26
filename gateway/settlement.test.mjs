import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createJsonStore } from "./store.mjs";
import { createRelayService } from "./service.mjs";

const PROGRAM_ID = "6v2peeoZVj2AXfczVLqyMUTHYt3XQPqAxCktpTwjUZap";

async function makeStore() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "ground-relay-settlement-"));
  const statePath = path.join(dir, "state.json");
  const store = createJsonStore({ statePath });
  await store.init();
  return { store, statePath };
}

function baseTask(overrides = {}) {
  return {
    id: "task-a", title: "Verify sign", description: "Human visual check",
    poster: "Poster1111111111111111111111111111111111", rewardAtomic: "1000000",
    rewardMint: "Mint111111111111111111111111111111111111",
    callbackUrl: "http://127.0.0.1:9999/resume",
    criteria: [{ id: "photo", description: "Photo", required: true }], ...overrides,
  };
}

function chainTask(overrides = {}) {
  return {
    taskPda: "TaskPdaA", taskIdHex: "11".repeat(32), poster: baseTask().poster,
    mint: baseTask().rewardMint, rewardAtomic: baseTask().rewardAtomic,
    status: "open", expiresAt: 2_000_000_000, ...overrides,
  };
}

const binding = { cluster: "devnet", programId: PROGRAM_ID, taskPda: "TaskPdaA", postSignature: "post-signature-a" };

function deps(store, overrides = {}) {
  return {
    store,
    chain: { readTask: async () => { throw new Error("unused"); } },
    callbackTransport: async () => ({ classification: "delivered", statusCode: 200 }),
    clock: { now: () => Date.parse("2026-09-26T02:00:00.000Z") },
    scheduler: { schedule: () => () => {} }, allowLoopbackHttp: true, programId: PROGRAM_ID,
    ...overrides,
  };
}

function makeScheduler() {
  const scheduled = [];
  return { scheduled, schedule(atMs, callback) { const item = { atMs, callback, cancelled: false }; scheduled.push(item); return () => { item.cancelled = true; }; } };
}

async function makePaidHarness({ callbackResults = [{ classification: "delivered", statusCode: 200 }], now = Date.parse("2026-09-26T03:00:00.000Z") } = {}) {
  const { store, statePath } = await makeStore();
  let current = chainTask();
  let currentNow = now;
  const calls = [];
  const scheduler = makeScheduler();
  const callbackTransport = async (input) => { calls.push(structuredClone(input)); return callbackResults.shift() ?? { classification: "delivered", statusCode: 200 }; };
  const service = createRelayService(deps(store, {
    chain: { readTask: async () => current }, callbackTransport, scheduler, clock: { now: () => currentNow },
  }));
  await service.createTask(baseTask());
  await service.bindTask("task-a", binding);
  return { service, store, statePath, scheduler, calls, setChain(value) { current = value; }, setNow(value) { currentNow = value; } };
}

test("paid notification requires authoritative paid state and creates no event early", async () => {
  const h = await makePaidHarness();
  h.setChain(chainTask({ status: "accepted", worker: "WorkerA", evidenceHash: "aa".repeat(32) }));
  await assert.rejects(() => h.service.notifyPaid("task-a", { signature: "settle-a" }), (error) => error.code === "settlement_not_confirmed");
  const task = await h.store.getTask("task-a");
  assert.equal(task.settlementSignature, undefined); assert.equal(task.resume, undefined); assert.equal(h.calls.length, 0);
});

test("paid notification is idempotent for same signature and conflicts for different signature", async () => {
  const h = await makePaidHarness();
  h.setChain(chainTask({ status: "paid", worker: "WorkerA", evidenceHash: "bb".repeat(32) }));
  const first = await h.service.notifyPaid("task-a", { signature: "settle-a" });
  assert.equal(first.status, "paid"); assert.equal(first.resume.state, "delivered"); assert.equal(h.calls.length, 1);
  const second = await h.service.notifyPaid("task-a", { signature: "settle-a" });
  assert.equal(second.resume.eventId, first.resume.eventId); assert.equal(h.calls.length, 1);
  await assert.rejects(() => h.service.notifyPaid("task-a", { signature: "settle-b" }), (error) => error.code === "settlement_conflict");
});

test("retryable callback failure persists next attempt before scheduling exact backoff", async () => {
  const h = await makePaidHarness({ callbackResults: [
    { classification: "retryable_failure", statusCode: 503, error: "busy" },
    { classification: "retryable_failure", statusCode: 503, error: "busy" },
  ] });
  h.setChain(chainTask({ status: "paid", worker: "WorkerA" }));
  const first = await h.service.notifyPaid("task-a", { signature: "settle-a" });
  assert.equal(first.resume.state, "retryable_failure"); assert.equal(first.resume.attempts, 1); assert.equal(first.resume.autoRetriesUsed, 0);
  assert.equal(Date.parse(first.resume.nextAttemptAt), Date.parse("2026-09-26T03:00:01.000Z"));
  assert.equal(h.scheduler.scheduled[0].atMs, Date.parse(first.resume.nextAttemptAt));
  await h.scheduler.scheduled[0].callback();
  const afterRetry = await h.store.getTask("task-a");
  assert.equal(afterRetry.resume.attempts, 2); assert.equal(afterRetry.resume.autoRetriesUsed, 1);
  assert.equal(Date.parse(afterRetry.resume.nextAttemptAt), Date.parse("2026-09-26T03:00:02.000Z"));
  assert.equal(h.calls[0].eventId, h.calls[1].eventId); assert.equal(h.calls[0].idempotencyKey, h.calls[1].idempotencyKey);
});

test("terminal callback failure is persisted without automatic retry", async () => {
  const h = await makePaidHarness({ callbackResults: [{ classification: "terminal_failure", statusCode: 422 }] });
  h.setChain(chainTask({ status: "paid", worker: "WorkerA" }));
  const task = await h.service.notifyPaid("task-a", { signature: "settle-a" });
  assert.equal(task.resume.state, "terminal_failure"); assert.equal(h.scheduler.scheduled.length, 0);
});

test("automatic retry budget stops after five retries beyond initial attempt", async () => {
  const h = await makePaidHarness({ callbackResults: Array.from({ length: 6 }, () => ({ classification: "retryable_failure", statusCode: 503 })) });
  h.setChain(chainTask({ status: "paid", worker: "WorkerA" }));
  await h.service.notifyPaid("task-a", { signature: "settle-a" });
  const expectedDelays = [1000, 2000, 4000, 8000, 16000];
  let expectedAt = Date.parse("2026-09-26T03:00:00.000Z") + expectedDelays[0];
  for (let index = 0; index < expectedDelays.length; index += 1) {
    const scheduled = h.scheduler.scheduled[index]; assert.ok(scheduled); assert.equal(scheduled.atMs, expectedAt);
    h.setNow(scheduled.atMs); await scheduled.callback();
    if (index + 1 < expectedDelays.length) expectedAt += expectedDelays[index + 1];
  }
  const task = await h.store.getTask("task-a");
  assert.equal(task.resume.attempts, 6); assert.equal(task.resume.autoRetriesUsed, 5); assert.equal(task.resume.nextAttemptAt, undefined); assert.equal(h.scheduler.scheduled.length, 5);
});

test("restart restores pending retry and delivered event is never resent", async () => {
  const h = await makePaidHarness({ callbackResults: [{ classification: "retryable_failure", statusCode: 503 }] });
  h.setChain(chainTask({ status: "paid", worker: "WorkerA" })); await h.service.notifyPaid("task-a", { signature: "settle-a" });
  const reloadedStore = createJsonStore({ statePath: h.statePath }); await reloadedStore.init();
  const scheduler = makeScheduler(); const calls = [];
  const restarted = createRelayService(deps(reloadedStore, {
    chain: { readTask: async () => chainTask({ status: "paid", worker: "WorkerA" }) },
    callbackTransport: async (input) => { calls.push(input); return { classification: "delivered", statusCode: 200 }; },
    scheduler, clock: { now: () => Date.parse("2026-09-26T03:00:00.500Z") },
  }));
  await restarted.start(); assert.equal(scheduler.scheduled.length, 1); assert.equal(scheduler.scheduled[0].atMs, Date.parse("2026-09-26T03:00:01.000Z"));
  await scheduler.scheduled[0].callback(); assert.equal((await reloadedStore.getTask("task-a")).resume.state, "delivered");
  const scheduler2 = makeScheduler(); const secondRestart = createRelayService(deps(reloadedStore, { scheduler: scheduler2 })); await secondRestart.start();
  assert.equal(scheduler2.scheduled.length, 0);
});

test("manual retry preserves event identity and resets automatic retry budget", async () => {
  const h = await makePaidHarness({ callbackResults: [{ classification: "retryable_failure", statusCode: 503 }, { classification: "delivered", statusCode: 200 }] });
  h.setChain(chainTask({ status: "paid", worker: "WorkerA" }));
  const failed = await h.service.notifyPaid("task-a", { signature: "settle-a" });
  const retried = await h.service.retryResume("task-a");
  assert.equal(retried.resume.state, "delivered"); assert.equal(retried.resume.eventId, failed.resume.eventId); assert.equal(retried.resume.idempotencyKey, failed.resume.idempotencyKey);
  assert.equal(h.calls[0].eventId, h.calls[1].eventId);
});

test("paid notification rejects migrated task without callback before accepting settlement", async () => {
  const h = await makePaidHarness(); h.setChain(chainTask({ status: "paid", worker: "WorkerA" }));
  await h.store.transaction((draft) => { delete draft.tasks["task-a"].callbackUrl; });
  await assert.rejects(() => h.service.notifyPaid("task-a", { signature: "settle-a" }), (error) => error.code === "callback_not_configured");
  const task = await h.store.getTask("task-a"); assert.equal(task.settlementSignature, undefined); assert.equal(task.resume, undefined);
});

test("manual retry requires an existing paid resume event", async () => {
  const { store } = await makeStore(); const service = createRelayService(deps(store)); await service.createTask(baseTask());
  await assert.rejects(() => service.retryResume("task-a"), (error) => error.code === "resume_not_ready");
});

test("restart schedules overdue retry immediately and leaves exhausted retry unscheduled", async () => {
  const h = await makePaidHarness({ callbackResults: [{ classification: "retryable_failure", statusCode: 503 }] });
  h.setChain(chainTask({ status: "paid", worker: "WorkerA" })); await h.service.notifyPaid("task-a", { signature: "settle-a" });
  const reloadedStore = createJsonStore({ statePath: h.statePath }); await reloadedStore.init();
  const overdueScheduler = makeScheduler(); const overdueNow = Date.parse("2026-09-26T03:00:05.000Z");
  const restarted = createRelayService(deps(reloadedStore, { scheduler: overdueScheduler, clock: { now: () => overdueNow } }));
  await restarted.start(); assert.equal(overdueScheduler.scheduled[0].atMs, overdueNow);
  await reloadedStore.transaction((draft) => { const resume = draft.tasks["task-a"].resume; resume.autoRetriesUsed = 5; resume.state = "retryable_failure"; delete resume.nextAttemptAt; });
  const exhaustedScheduler = makeScheduler(); const exhausted = createRelayService(deps(reloadedStore, { scheduler: exhaustedScheduler })); await exhausted.start();
  assert.equal(exhaustedScheduler.scheduled.length, 0);
});
