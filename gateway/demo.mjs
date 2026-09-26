import { createServer } from "node:http";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { sendResumeCallback } from "./callbacks.mjs";
import { createRelayService, GROUND_RELAY_PROGRAM_ID } from "./service.mjs";
import { createJsonStore } from "./store.mjs";

async function startMockAgentReceiver() {
  const received = [];
  const server = createServer(async (req, res) => {
    if (req.method !== "POST" || req.url !== "/resume") {
      res.writeHead(404).end();
      return;
    }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    received.push({
      payload,
      idempotencyKey: req.headers["idempotency-key"],
      eventId: req.headers["x-ground-relay-event-id"],
    });
    res.writeHead(204).end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    received,
    callbackUrl: `http://127.0.0.1:${server.address().port}/resume`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

export async function runSeededDemo({ quiet = false } = {}) {
  const receiver = await startMockAgentReceiver();
  try {
    const dir = await mkdtemp(path.join(os.tmpdir(), "ground-relay-demo-"));
    const statePath = path.join(dir, "state.json");
    const taskId = "seeded-agent-blocker";
    const taskPda = "SeededTaskPda11111111111111111111111111111";
    const poster = "SeededPoster111111111111111111111111111111";
    const rewardMint = "SeededMint11111111111111111111111111111111";
    const rewardAtomic = "1000000";
    const worker = "SeededWorker111111111111111111111111111111";
    const evidenceHash = "ab".repeat(32);
    const settlementSignature = "seeded-settlement-signature";
    const now = Date.parse("2026-09-26T05:00:00.000Z");

    let chainState = {
      taskPda,
      taskIdHex: "11".repeat(32),
      poster,
      mint: rewardMint,
      rewardAtomic,
      expiresAt: 2_000_000_000,
      status: "open",
    };
    const chain = { readTask: async () => structuredClone(chainState) };
    const callbackTransport = (input) => sendResumeCallback({ ...input, timeoutMs: 2_000 });
    const noRetryScheduler = { schedule: () => () => {} };

    const store = createJsonStore({ statePath });
    await store.init();
    const service = createRelayService({
      store,
      chain,
      callbackTransport,
      clock: { now: () => now },
      scheduler: noRetryScheduler,
      allowLoopbackHttp: true,
      programId: GROUND_RELAY_PROGRAM_ID,
    });

    await service.createTask({
      id: taskId,
      title: "Verify a storefront sign",
      description: "A blocked autonomous agent needs one human visual verification.",
      poster,
      rewardAtomic,
      rewardMint,
      callbackUrl: receiver.callbackUrl,
      criteria: [{ id: "photo", description: "Capture one clear photo", required: true }],
    }, { idempotencyKey: "seeded-create" });

    await service.bindTask(taskId, {
      cluster: "devnet",
      programId: GROUND_RELAY_PROGRAM_ID,
      taskPda,
      postSignature: "seeded-post-signature",
    });

    chainState = {
      ...chainState,
      status: "paid",
      worker,
      evidenceHash,
    };

    const paid = await service.notifyPaid(taskId, { signature: settlementSignature });
    const callbackCount = receiver.received.length;

    const restartedStore = createJsonStore({ statePath });
    await restartedStore.init();
    const restartedService = createRelayService({
      store: restartedStore,
      chain,
      callbackTransport,
      clock: { now: () => now + 60_000 },
      scheduler: noRetryScheduler,
      allowLoopbackHttp: true,
      programId: GROUND_RELAY_PROGRAM_ID,
    });
    await restartedService.start();
    await restartedService.notifyPaid(taskId, { signature: settlementSignature });

    const proof = {
      taskId,
      status: paid.status,
      resumeState: paid.resume.state,
      persistedEventId: paid.resume.eventId,
      callbackCount,
      callbackPayload: receiver.received[0]?.payload,
      callbackIdempotencyKey: receiver.received[0]?.idempotencyKey,
      restartCallbackCount: receiver.received.length,
      noDuplicateAfterRestart: receiver.received.length === callbackCount,
    };

    if (!quiet) {
      console.log("Ground Relay M7 seeded demo: PASS");
      console.log(JSON.stringify(proof, null, 2));
    }
    return proof;
  } finally {
    await receiver.close();
  }
}

const isDirect = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect) {
  await runSeededDemo();
}
