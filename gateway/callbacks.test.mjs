import assert from "node:assert/strict";
import test from "node:test";

import {
  buildResumeEvent,
  sendResumeCallback,
  validateCallbackUrl,
} from "./callbacks.mjs";

const task = {
  id: "task-7",
  chain: { taskPda: "TaskPda111111111111111111111111111111111" },
  evidenceHash: "ab".repeat(32),
  worker: "Worker111111111111111111111111111111111",
  rewardAtomic: "1000000",
  rewardMint: "So11111111111111111111111111111111111111112",
};

const settlementSignature = "settlement-signature";
const paidAtObserved = "2026-09-26T02:00:00.000Z";

test("callback URL policy accepts https and explicit loopback http only", () => {
  assert.equal(validateCallbackUrl("https://agent.example/resume", { allowLoopbackHttp: false }).href, "https://agent.example/resume");
  assert.equal(validateCallbackUrl("http://127.0.0.1:9999/resume", { allowLoopbackHttp: true }).hostname, "127.0.0.1");
  assert.equal(validateCallbackUrl("http://localhost:9999/resume", { allowLoopbackHttp: true }).hostname, "localhost");
  assert.throws(() => validateCallbackUrl("http://agent.example/resume", { allowLoopbackHttp: false }));
  assert.throws(() => validateCallbackUrl("file:///tmp/resume", { allowLoopbackHttp: true }));
  assert.throws(() => validateCallbackUrl("ftp://agent.example/resume", { allowLoopbackHttp: true }));
});

test("resume event identity is stable and preserves first observed paid time", () => {
  const first = buildResumeEvent({ task, settlementSignature, paidAtObserved });
  const second = buildResumeEvent({ task, settlementSignature, paidAtObserved });
  assert.equal(first.idempotencyKey, `ground-relay:${task.id}:paid:${settlementSignature}`);
  assert.match(first.eventId, /^[a-f0-9]{64}$/);
  assert.deepEqual(first, second);
  assert.equal(first.payload.eventId, first.eventId);
  assert.equal(first.payload.type, "ground_relay.task.paid");
  assert.equal(first.payload.paidAtObserved, paidAtObserved);
  assert.equal(first.payload.taskPda, task.chain.taskPda);
});

test("resume transport classifies 2xx as delivered and sends stable metadata", async () => {
  const event = buildResumeEvent({ task, settlementSignature, paidAtObserved });
  let captured;
  const result = await sendResumeCallback({
    url: "https://agent.example/resume",
    ...event,
    fetchImpl: async (url, options) => {
      captured = { url, options };
      return { status: 204 };
    },
  });
  assert.deepEqual(result, { classification: "delivered", statusCode: 204 });
  assert.equal(captured.url, "https://agent.example/resume");
  assert.equal(captured.options.headers["content-type"], "application/json");
  assert.equal(captured.options.headers["Idempotency-Key"], event.idempotencyKey);
  assert.deepEqual(JSON.parse(captured.options.body), event.payload);
});

test("resume transport classifies retryable HTTP statuses", async () => {
  for (const status of [408, 425, 429, 500, 503]) {
    const result = await sendResumeCallback({
      url: "https://agent.example/resume",
      eventId: "e",
      idempotencyKey: "k",
      payload: { eventId: "e" },
      fetchImpl: async () => ({ status }),
    });
    assert.deepEqual(result, { classification: "retryable_failure", statusCode: status });
  }
});

test("resume transport classifies non-retryable 4xx as terminal", async () => {
  for (const status of [400, 401, 403, 404, 422]) {
    const result = await sendResumeCallback({
      url: "https://agent.example/resume",
      eventId: "e",
      idempotencyKey: "k",
      payload: { eventId: "e" },
      fetchImpl: async () => ({ status }),
    });
    assert.deepEqual(result, { classification: "terminal_failure", statusCode: status });
  }
});

test("resume transport classifies network and timeout errors as retryable", async () => {
  const network = await sendResumeCallback({
    url: "https://agent.example/resume",
    eventId: "e",
    idempotencyKey: "k",
    payload: { eventId: "e" },
    fetchImpl: async () => { throw new Error("socket closed"); },
  });
  assert.equal(network.classification, "retryable_failure");
  assert.match(network.error, /socket closed/);

  const timeout = await sendResumeCallback({
    url: "https://agent.example/resume",
    eventId: "e",
    idempotencyKey: "k",
    payload: { eventId: "e" },
    timeoutMs: 5,
    fetchImpl: async (_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    }),
  });
  assert.equal(timeout.classification, "retryable_failure");
});
