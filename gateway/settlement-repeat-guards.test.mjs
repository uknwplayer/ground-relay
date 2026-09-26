import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createJsonStore } from "./store.mjs";
import { createRelayService } from "./service.mjs";

const PROGRAM_ID = "6v2peeoZVj2AXfczVLqyMUTHYt3XQPqAxCktpTwjUZap";
const BINDING = {
  cluster: "devnet",
  programId: PROGRAM_ID,
  taskPda: "TaskPdaA",
  postSignature: "post-signature-a",
};

function logicalTask() {
  return {
    id: "task-a",
    title: "Verify sign",
    description: "Human visual check",
    poster: "Poster1111111111111111111111111111111111",
    rewardAtomic: "1000000",
    rewardMint: "Mint111111111111111111111111111111111111",
    callbackUrl: "http://127.0.0.1:9999/resume",
    criteria: [{ id: "photo", description: "Photo", required: true }],
  };
}

function paidChainTask() {
  return {
    taskPda: BINDING.taskPda,
    taskIdHex: "11".repeat(32),
    poster: logicalTask().poster,
    mint: logicalTask().rewardMint,
    rewardAtomic: logicalTask().rewardAtomic,
    status: "paid",
    worker: "WorkerA",
    evidenceHash: "aa".repeat(32),
    expiresAt: 2_000_000_000,
  };
}

function makeScheduler() {
  const scheduled = [];
  return {
    scheduled,
    schedule(atMs, callback) {
      const item = { atMs, callback, cancelled: false };
      scheduled.push(item);
      return () => { item.cancelled = true; };
    },
  };
}

async function makeHarness({ callbackTransport } = {}) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "ground-relay-paid-guard-"));
  const store = createJsonStore({ statePath: path.join(dir, "state.json") });
  await store.init();
  const calls = [];
  const scheduler = makeScheduler();
  let now = Date.parse("2026-09-26T03:00:00.000Z");
  const service = createRelayService({
    store,
    chain: { readTask: async () => paidChainTask() },
    callbackTransport: callbackTransport ?? (async (input) => {
      calls.push(structuredClone(input));
      return { classification: "delivered", statusCode: 200 };
    }),
    clock: { now: () => now },
    scheduler,
    allowLoopbackHttp: true,
    programId: PROGRAM_ID,
  });
  await service.createTask(logicalTask());
  await service.bindTask("task-a", BINDING);
  return { service, store, calls, scheduler, setNow(value) { now = value; } };
}

test("repeated paid notification does not resend after terminal failure; manual retry still can", async () => {
  let h;
  const results = [
    { classification: "terminal_failure", statusCode: 422 },
    { classification: "delivered", statusCode: 200 },
  ];
  h = await makeHarness({
    callbackTransport: async (input) => {
      h.calls.push(structuredClone(input));
      return results.shift();
    },
  });

  const first = await h.service.notifyPaid("task-a", { signature: "settle-a" });
  assert.equal(first.resume.state, "terminal_failure");
  assert.equal(h.calls.length, 1);

  const repeated = await h.service.notifyPaid("task-a", { signature: "settle-a" });
  assert.equal(repeated.resume.state, "terminal_failure");
  assert.equal(h.calls.length, 1);

  const manual = await h.service.retryResume("task-a");
  assert.equal(manual.resume.state, "delivered");
  assert.equal(h.calls.length, 2);
  assert.equal(h.calls[0].eventId, h.calls[1].eventId);
});

test("repeated paid notification does not bypass exhausted automatic retry budget", async () => {
  let h;
  h = await makeHarness({
    callbackTransport: async (input) => {
      h.calls.push(structuredClone(input));
      return { classification: "retryable_failure", statusCode: 503 };
    },
  });

  await h.service.notifyPaid("task-a", { signature: "settle-a" });
  for (let index = 0; index < 5; index += 1) {
    const scheduled = h.scheduler.scheduled[index];
    assert.ok(scheduled);
    h.setNow(scheduled.atMs);
    await scheduled.callback();
  }

  const exhausted = await h.store.getTask("task-a");
  assert.equal(exhausted.resume.state, "retryable_failure");
  assert.equal(exhausted.resume.autoRetriesUsed, 5);
  assert.equal(exhausted.resume.nextAttemptAt, undefined);
  assert.equal(h.calls.length, 6);

  const repeated = await h.service.notifyPaid("task-a", { signature: "settle-a" });
  assert.equal(repeated.resume.state, "retryable_failure");
  assert.equal(h.calls.length, 6);
});

test("repeated paid notification may immediately redeliver an ordinary retryable failure with stable identity", async () => {
  let h;
  const results = [
    { classification: "retryable_failure", statusCode: 503 },
    { classification: "delivered", statusCode: 200 },
  ];
  h = await makeHarness({
    callbackTransport: async (input) => {
      h.calls.push(structuredClone(input));
      return results.shift();
    },
  });

  const first = await h.service.notifyPaid("task-a", { signature: "settle-a" });
  assert.equal(first.resume.state, "retryable_failure");
  const repeated = await h.service.notifyPaid("task-a", { signature: "settle-a" });
  assert.equal(repeated.resume.state, "delivered");
  assert.equal(h.calls.length, 2);
  assert.equal(h.calls[0].eventId, h.calls[1].eventId);
  assert.equal(h.calls[0].idempotencyKey, h.calls[1].idempotencyKey);
});

test("repeated paid notification does not start a second callback while the first is pending", async () => {
  let resolveFirst;
  const firstResult = new Promise((resolve) => { resolveFirst = resolve; });
  let h;
  h = await makeHarness({
    callbackTransport: async (input) => {
      h.calls.push(structuredClone(input));
      if (h.calls.length === 1) return firstResult;
      return { classification: "delivered", statusCode: 200 };
    },
  });

  const firstCall = h.service.notifyPaid("task-a", { signature: "settle-a" });
  while (h.calls.length === 0) await new Promise((resolve) => setImmediate(resolve));

  const repeated = await h.service.notifyPaid("task-a", { signature: "settle-a" });
  resolveFirst({ classification: "delivered", statusCode: 200 });
  await firstCall;

  assert.equal(repeated.resume.state, "pending");
  assert.equal(h.calls.length, 1);
  assert.equal((await h.store.getTask("task-a")).resume.state, "delivered");
});
