import assert from "node:assert/strict";
import test from "node:test";

import { createRelayServer, tasks } from "./server.mjs";

async function withServer(fn) {
  tasks.clear();
  const server = createRelayServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const base = `http://127.0.0.1:${address.port}`;
  try {
    await fn(base);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function post(url, body) {
  return fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("agent blocker -> worker -> evidence -> accepted -> paid -> resume", async () => {
  await withServer(async (base) => {
    let response = await post(`${base}/v1/tasks`, {
      id: "demo-1",
      title: "Verify a storefront sign",
      description: "Human-only visual check",
      poster: "agent:demo",
      rewardAtomic: "1000000",
      rewardMint: "USDC-devnet",
      callbackUrl: "http://127.0.0.1:9999/resume",
      criteria: [{ id: "photo", description: "Photo", required: true }],
    });
    assert.equal(response.status, 201);

    response = await post(`${base}/v1/tasks/demo-1/claim`, {
      worker: "worker-wallet",
      signature: "claim-sig",
    });
    assert.equal((await response.json()).status, "claimed");

    const bundleHash = "a".repeat(64);
    response = await post(`${base}/v1/tasks/demo-1/deliveries`, {
      worker: "worker-wallet",
      bundleHash,
      signature: "delivery-sig",
    });
    assert.equal(response.status, 202);
    assert.equal((await response.json()).status, "delivered");

    response = await post(`${base}/v1/tasks/demo-1/verify`, {
      poster: "agent:demo",
      accepted: true,
    });
    assert.equal((await response.json()).status, "accepted");

    response = await post(`${base}/v1/tasks/demo-1/paid`, {
      signature: "settlement-sig",
    });
    const paid = await response.json();
    assert.equal(paid.task.status, "paid");
    assert.equal(paid.resume.evidenceHash, bundleHash);
    assert.equal(paid.resume.settlementSignature, "settlement-sig");
  });
});

test("wrong worker cannot deliver evidence", async () => {
  await withServer(async (base) => {
    await post(`${base}/v1/tasks`, {
      id: "demo-2",
      title: "Task",
      description: "Task",
      poster: "agent:demo",
      rewardAtomic: "1",
      rewardMint: "USDC-devnet",
      criteria: [{ id: "x", description: "x", required: true }],
    });
    await post(`${base}/v1/tasks/demo-2/claim`, {
      worker: "worker-a",
    });

    const response = await post(`${base}/v1/tasks/demo-2/deliveries`, {
      worker: "worker-b",
      bundleHash: "b".repeat(64),
    });
    assert.equal(response.status, 403);
  });
});
