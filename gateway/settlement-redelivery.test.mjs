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

test("repeated paid notification retries an unacknowledged resume event", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "ground-relay-paid-repeat-"));
  const store = createJsonStore({ statePath: path.join(dir, "state.json") });
  await store.init();

  const calls = [];
  const results = [
    { classification: "retryable_failure", statusCode: 503, error: "busy" },
    { classification: "delivered", statusCode: 200 },
  ];

  const service = createRelayService({
    store,
    chain: { readTask: async () => paidChainTask() },
    callbackTransport: async (input) => {
      calls.push(structuredClone(input));
      return results.shift();
    },
    clock: { now: () => Date.parse("2026-09-26T03:00:00.000Z") },
    scheduler: { schedule: () => () => {} },
    allowLoopbackHttp: true,
    programId: PROGRAM_ID,
  });

  await service.createTask(logicalTask());
  await service.bindTask("task-a", BINDING);

  const first = await service.notifyPaid("task-a", { signature: "settle-a" });
  assert.equal(first.resume.state, "retryable_failure");
  assert.equal(calls.length, 1);

  const second = await service.notifyPaid("task-a", { signature: "settle-a" });
  assert.equal(second.resume.state, "delivered");
  assert.equal(calls.length, 2);
  assert.equal(calls[1].eventId, calls[0].eventId);
  assert.equal(calls[1].idempotencyKey, calls[0].idempotencyKey);
});
