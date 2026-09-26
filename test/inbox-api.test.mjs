import assert from "node:assert/strict";
import test from "node:test";

import { fetchTaskInbox, InboxClientError, parseInboxResponse } from "../src/inbox/api.ts";
import { resolveGatewayBaseUrl } from "../src/inbox/config.ts";

const PROGRAM_ID = "6v2peeoZVj2AXfczVLqyMUTHYt3XQPqAxCktpTwjUZap";

function validTask(overrides = {}) {
  return {
    id: "task-a",
    title: "Verify a storefront sign",
    description: "Capture one clear photo.",
    poster: "Poster111111111111111111111111111111111",
    status: "open",
    rewardAtomic: "1000000",
    rewardMint: "So11111111111111111111111111111111111111112",
    createdAt: "2026-09-26T12:00:00.000Z",
    criteria: [{ id: "photo", description: "Capture one clear photo", required: true }],
    ...overrides,
  };
}

test("parseInboxResponse accepts worker-safe bound and unbound tasks", () => {
  const input = {
    tasks: [
      validTask({
        id: "bound",
        worker: "Worker111",
        evidenceHash: "ab".repeat(32),
        settlementSignature: "settlement-signature",
        chain: {
          cluster: "devnet",
          programId: PROGRAM_ID,
          taskPda: "TaskPda111",
          postSignature: "post-signature",
          lastSyncedAt: "2026-09-26T12:01:00.000Z",
        },
      }),
      validTask({ id: "unbound", createdAt: "2026-09-26T11:00:00.000Z" }),
    ],
  };

  const tasks = parseInboxResponse(input);
  assert.equal(tasks.length, 2);
  assert.equal(tasks[0].id, "bound");
  assert.equal(tasks[0].chain?.taskPda, "TaskPda111");
  assert.equal(tasks[1].chain, undefined);
});

test("parseInboxResponse rejects malformed or leaked worker payloads", () => {
  assert.throws(() => parseInboxResponse({}), (error) => error instanceof InboxClientError && error.code === "invalid_response");
  assert.throws(
    () => parseInboxResponse({ tasks: [validTask({ status: "mystery" })] }),
    (error) => error instanceof InboxClientError && error.code === "invalid_response",
  );
  assert.throws(
    () => parseInboxResponse({ tasks: [validTask({ callbackUrl: "https://secret.example/resume" })] }),
    (error) => error instanceof InboxClientError && error.code === "invalid_response",
  );
});

test("fetchTaskInbox requests the normalized collection endpoint and parses it", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return {
      ok: true,
      status: 200,
      async json() {
        return { tasks: [validTask()] };
      },
    };
  };

  const tasks = await fetchTaskInbox("https://relay.example/v1/", fetchImpl);
  assert.equal(tasks[0].id, "task-a");
  assert.deepEqual(calls, [{ url: "https://relay.example/v1/tasks", init: { method: "GET", headers: { accept: "application/json" } } }]);
});

test("fetchTaskInbox maps transport and non-2xx failures to gateway_unavailable", async () => {
  await assert.rejects(
    () => fetchTaskInbox("https://relay.example/v1", async () => { throw new Error("offline"); }),
    (error) => error instanceof InboxClientError && error.code === "gateway_unavailable",
  );

  await assert.rejects(
    () => fetchTaskInbox("https://relay.example/v1", async () => ({ ok: false, status: 503, json: async () => ({}) })),
    (error) => error instanceof InboxClientError && error.code === "gateway_unavailable",
  );
});

test("resolveGatewayBaseUrl normalizes explicit and Expo public configuration", () => {
  const previous = process.env.EXPO_PUBLIC_GROUND_RELAY_GATEWAY_URL;
  try {
    assert.equal(resolveGatewayBaseUrl(" https://relay.example/v1/// "), "https://relay.example/v1");
    assert.equal(resolveGatewayBaseUrl("ftp://relay.example/v1"), undefined);
    assert.equal(resolveGatewayBaseUrl("   "), undefined);

    process.env.EXPO_PUBLIC_GROUND_RELAY_GATEWAY_URL = "https://env-relay.example/v1/";
    assert.equal(resolveGatewayBaseUrl(), "https://env-relay.example/v1");
  } finally {
    if (previous === undefined) delete process.env.EXPO_PUBLIC_GROUND_RELAY_GATEWAY_URL;
    else process.env.EXPO_PUBLIC_GROUND_RELAY_GATEWAY_URL = previous;
  }
});
