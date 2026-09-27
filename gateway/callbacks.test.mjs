import assert from "node:assert/strict";
import test from "node:test";

import {
  buildResumeEvent,
  resolveCallbackTarget,
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
const publicLookup = async () => [{ address: "93.184.216.34", family: 4 }];

function callbackInput(overrides = {}) {
  return {
    url: "https://agent.example/resume",
    eventId: "e",
    idempotencyKey: "k",
    payload: { eventId: "e" },
    lookupImpl: publicLookup,
    ...overrides,
  };
}

test("callback URL policy accepts https and explicit loopback http only", () => {
  assert.equal(validateCallbackUrl("https://agent.example/resume", { allowLoopbackHttp: false }).href, "https://agent.example/resume");
  assert.equal(validateCallbackUrl("http://127.0.0.1:9999/resume", { allowLoopbackHttp: true }).hostname, "127.0.0.1");
  assert.equal(validateCallbackUrl("http://localhost:9999/resume", { allowLoopbackHttp: true }).hostname, "localhost");
  assert.throws(() => validateCallbackUrl("http://agent.example/resume", { allowLoopbackHttp: false }));
  assert.throws(() => validateCallbackUrl("file:///tmp/resume", { allowLoopbackHttp: true }));
  assert.throws(() => validateCallbackUrl("ftp://agent.example/resume", { allowLoopbackHttp: true }));
});

test("callback URL policy rejects credentials and direct non-public addresses", () => {
  assert.throws(() => validateCallbackUrl("https://user:pass@agent.example/resume"), /credential/i);
  for (const value of [
    "https://127.0.0.1/resume",
    "https://10.0.0.7/resume",
    "https://169.254.169.254/latest/meta-data",
    "https://192.168.1.4/resume",
    "https://[::1]/resume",
    "https://[fc00::1]/resume",
  ]) {
    assert.throws(() => validateCallbackUrl(value), /public|unsafe/i, value);
  }
});

test("DNS resolution rejects private targets and returns one pinned public address", async () => {
  await assert.rejects(
    () => resolveCallbackTarget("https://internal.example/resume", {
      lookupImpl: async () => [{ address: "10.20.30.40", family: 4 }],
    }),
    /public|unsafe/i,
  );

  const target = await resolveCallbackTarget("https://agent.example/resume", {
    lookupImpl: async () => [
      { address: "93.184.216.34", family: 4 },
      { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
    ],
  });
  assert.equal(target.address, "93.184.216.34");
  assert.equal(target.family, 4);
  assert.equal(target.url.hostname, "agent.example");
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

test("resume transport classifies 2xx as delivered, sends stable metadata, and pins the validated address", async () => {
  const event = buildResumeEvent({ task, settlementSignature, paidAtObserved });
  let captured;
  const result = await sendResumeCallback({
    url: "https://agent.example/resume",
    ...event,
    lookupImpl: publicLookup,
    requestImpl: async (input) => {
      captured = input;
      return { statusCode: 204, headers: {} };
    },
  });
  assert.deepEqual(result, { classification: "delivered", statusCode: 204 });
  assert.equal(captured.url.href, "https://agent.example/resume");
  assert.equal(captured.address, "93.184.216.34");
  assert.equal(captured.headers["content-type"], "application/json");
  assert.equal(captured.headers["Idempotency-Key"], event.idempotencyKey);
  assert.deepEqual(JSON.parse(captured.body), event.payload);
});

test("resume transport classifies retryable HTTP statuses", async () => {
  for (const statusCode of [408, 425, 429, 500, 503]) {
    const result = await sendResumeCallback(callbackInput({
      requestImpl: async () => ({ statusCode, headers: {} }),
    }));
    assert.deepEqual(result, { classification: "retryable_failure", statusCode });
  }
});

test("resume transport classifies non-retryable 4xx as terminal", async () => {
  for (const statusCode of [400, 401, 403, 404, 422]) {
    const result = await sendResumeCallback(callbackInput({
      requestImpl: async () => ({ statusCode, headers: {} }),
    }));
    assert.deepEqual(result, { classification: "terminal_failure", statusCode });
  }
});

test("resume transport classifies network and timeout errors as retryable", async () => {
  for (const message of ["socket closed", "callback_timeout"]) {
    const result = await sendResumeCallback(callbackInput({
      requestImpl: async () => { throw new Error(message); },
    }));
    assert.equal(result.classification, "retryable_failure");
    assert.match(result.error, new RegExp(message));
  }
});

test("redirect targets are revalidated before a second connection", async () => {
  let requests = 0;
  const result = await sendResumeCallback(callbackInput({
    lookupImpl: async (hostname) => hostname === "agent.example"
      ? [{ address: "93.184.216.34", family: 4 }]
      : [{ address: "169.254.169.254", family: 4 }],
    requestImpl: async () => {
      requests += 1;
      return {
        statusCode: 307,
        headers: { location: "https://metadata.internal/latest" },
      };
    },
  }));

  assert.equal(result.classification, "terminal_failure");
  assert.match(result.error, /public|unsafe/i);
  assert.equal(requests, 1);
});

test("redirect chains are bounded", async () => {
  let requests = 0;
  const result = await sendResumeCallback(callbackInput({
    maxRedirects: 1,
    requestImpl: async ({ url }) => {
      requests += 1;
      return {
        statusCode: 307,
        headers: { location: `${url.origin}/hop-${requests}` },
      };
    },
  }));

  assert.equal(result.classification, "terminal_failure");
  assert.match(result.error, /redirect/i);
  assert.equal(requests, 2);
});
