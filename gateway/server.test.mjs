import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createRelayServer } from "./server.mjs";
import { createRelayService } from "./service.mjs";
import { createJsonStore } from "./store.mjs";

const PROGRAM_ID = "6v2peeoZVj2AXfczVLqyMUTHYt3XQPqAxCktpTwjUZap";

async function withServer(service, fn) {
  const server = createRelayServer({ service });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try { await fn(base); } finally { await new Promise((resolve) => server.close(resolve)); }
}

async function request(url, { method = "GET", body, headers = {} } = {}) {
  return fetch(url, {
    method,
    headers: body === undefined ? headers : { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function makeRealService(statePath) {
  const store = createJsonStore({ statePath });
  await store.init();
  return createRelayService({
    store,
    chain: { readTask: async () => { throw new Error("unused"); } },
    callbackTransport: async () => ({ classification: "delivered", statusCode: 200 }),
    clock: { now: () => Date.parse("2026-09-26T04:00:00.000Z") },
    scheduler: { schedule: () => () => {} },
    allowLoopbackHttp: true,
    programId: PROGRAM_ID,
  });
}

function createBody(overrides = {}) {
  return {
    id: "http-task",
    title: "Verify sign",
    description: "Human check",
    poster: "Poster",
    rewardAtomic: "1000000",
    rewardMint: "Mint",
    callbackUrl: "http://127.0.0.1:9999/resume",
    criteria: [{ id: "photo", description: "Photo", required: true }],
    ...overrides,
  };
}

test("HTTP create passes idempotency key and durable GET survives server restart", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "ground-relay-http-"));
  const statePath = path.join(dir, "state.json");
  const firstService = await makeRealService(statePath);
  await withServer(firstService, async (base) => {
    const response = await request(`${base}/v1/tasks`, {
      method: "POST",
      headers: { "Idempotency-Key": "http-create-1" },
      body: createBody(),
    });
    assert.equal(response.status, 201);
    assert.equal((await response.json()).id, "http-task");
  });

  const restarted = await makeRealService(statePath);
  await withServer(restarted, async (base) => {
    const response = await request(`${base}/v1/tasks/http-task`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).title, "Verify sign");
    const repeat = await request(`${base}/v1/tasks`, {
      method: "POST",
      headers: { "Idempotency-Key": "http-create-1" },
      body: createBody(),
    });
    assert.equal(repeat.status, 201);
    assert.equal((await repeat.json()).id, "http-task");
  });
});

test("HTTP transport dispatches binding sync paid retry and legacy routes to service", async () => {
  const calls = [];
  const service = {
    getTask: async (id) => ({ id, status: "open" }),
    createTask: async (body, options) => { calls.push(["create", body, options]); return { id: body.id, status: "open" }; },
    bindTask: async (id, body) => { calls.push(["bind", id, body]); return { id, bound: true }; },
    syncTask: async (id) => { calls.push(["sync", id]); return { id, status: "paid" }; },
    notifyPaid: async (id, body) => { calls.push(["paid", id, body]); return { id, status: "paid", resume: { state: "delivered" } }; },
    retryResume: async (id) => { calls.push(["retry", id]); return { id, status: "paid", resume: { state: "delivered" } }; },
    claimLocal: async (id, body) => { calls.push(["claim", id, body]); return { id, status: "claimed" }; },
    deliverLocal: async (id, body) => { calls.push(["deliver", id, body]); return { id, status: "delivered" }; },
    verifyLocal: async (id, body) => { calls.push(["verify", id, body]); return { id, status: "accepted" }; },
  };
  await withServer(service, async (base) => {
    assert.equal((await request(`${base}/v1/tasks/t/chain-binding`, { method: "PUT", body: { taskPda: "p" } })).status, 200);
    assert.equal((await request(`${base}/v1/tasks/t/sync`, { method: "POST", body: {} })).status, 200);
    assert.equal((await request(`${base}/v1/tasks/t/paid`, { method: "POST", body: { signature: "s" } })).status, 200);
    assert.equal((await request(`${base}/v1/tasks/t/resume/retry`, { method: "POST", body: {} })).status, 200);
    assert.equal((await request(`${base}/v1/tasks/t/claim`, { method: "POST", body: { worker: "w" } })).status, 200);
    assert.equal((await request(`${base}/v1/tasks/t/deliveries`, { method: "POST", body: { worker: "w", bundleHash: "a".repeat(64) } })).status, 202);
    assert.equal((await request(`${base}/v1/tasks/t/verify`, { method: "POST", body: { poster: "p", accepted: true } })).status, 200);
  });
  assert.deepEqual(calls.map((call) => call[0]), ["bind", "sync", "paid", "retry", "claim", "deliver", "verify"]);
});

test("HTTP maps stable domain errors to status codes", async () => {
  const mappings = [
    ["task_not_found", 404], ["invalid_task", 400], ["callback_not_configured", 400],
    ["wrong_worker", 403], ["wrong_poster", 403], ["worker_required", 400], ["invalid_bundle_hash", 400],
    ["task_exists", 409], ["idempotency_conflict", 409], ["invalid_status", 409], ["task_not_bound", 409],
    ["binding_conflict", 409], ["chain_authoritative", 409], ["chain_mismatch", 409],
    ["settlement_not_confirmed", 409], ["settlement_conflict", 409], ["resume_not_ready", 409],
    ["chain_unavailable", 503],
  ];
  for (const [code, expected] of mappings) {
    const service = { getTask: async () => { const error = new Error(code); error.code = code; throw error; } };
    await withServer(service, async (base) => {
      const response = await request(`${base}/v1/tasks/x`);
      assert.equal(response.status, expected, code);
      assert.equal((await response.json()).error, code);
    });
  }
});

test("HTTP create rejects missing or unsafe callback with 400", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "ground-relay-http-"));
  const service = await makeRealService(path.join(dir, "state.json"));
  await withServer(service, async (base) => {
    for (const body of [createBody({ callbackUrl: undefined }), createBody({ callbackUrl: "file:///tmp/resume" })]) {
      const response = await request(`${base}/v1/tasks`, { method: "POST", body });
      assert.equal(response.status, 400);
      assert.equal((await response.json()).error, "invalid_task");
    }
  });
});

test("HTTP malformed JSON returns invalid_task instead of internal_error", async () => {
  const service = { createTask: async () => ({}) };
  await withServer(service, async (base) => {
    const response = await fetch(`${base}/v1/tasks`, { method: "POST", headers: { "content-type": "application/json" }, body: "{" });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, "invalid_task");
  });
});
