import assert from "node:assert/strict";
import test from "node:test";

import { buildTaskHistory } from "../src/inbox/history.ts";

function summary(overrides = {}) {
  return {
    id: "task-a",
    title: "Verify sign",
    description: "Human visual check",
    poster: "PosterA",
    status: "paid",
    worker: "WorkerA",
    rewardAtomic: "1000000",
    rewardMint: "MintA",
    createdAt: "2026-09-26T18:00:00.000Z",
    criteria: [{ id: "photo", description: "Photo", required: true }],
    settlementSignature: "settlement-a",
    chain: {
      cluster: "devnet",
      programId: "6v2peeoZVj2AXfczVLqyMUTHYt3XQPqAxCktpTwjUZap",
      taskPda: "TaskPdaA",
      postSignature: "post-a",
      lastSyncedAt: "2026-09-26T18:10:00.000Z",
    },
    ...overrides,
  };
}

function authoritative(overrides = {}) {
  return {
    authoritative: true,
    taskId: "task-a",
    taskPda: "TaskPdaA",
    taskIdHex: "11".repeat(32),
    poster: "PosterA",
    worker: "WorkerA",
    rewardMint: "MintA",
    rewardAtomic: "1000000",
    expiresAt: 2_000_000_000,
    status: "paid",
    evidenceHash: "aa".repeat(32),
    ...overrides,
  };
}

function session(overrides = {}) {
  return {
    taskId: "task-a",
    taskPda: "TaskPdaA",
    claimSignature: "claim-a",
    deliverySignature: "delivery-a",
    payoutSignature: "payout-a",
    expectedEvidenceHash: "aa".repeat(32),
    updatedAt: "2026-09-26T18:20:00.000Z",
    ...overrides,
  };
}

test("paid authoritative task produces a Solana-confirmed lifecycle with restored receipts", () => {
  const history = buildTaskHistory({ summary: summary(), session: session(), authoritative: authoritative() });
  assert.deepEqual(history.map((entry) => entry.stage), ["posted", "claimed", "delivered", "accepted", "paid"]);
  assert.ok(history.every((entry) => entry.state === "solana_confirmed"));
  assert.deepEqual(history.find((entry) => entry.stage === "posted").receipts, [{ label: "Post signature", value: "post-a", source: "gateway" }]);
  assert.deepEqual(history.find((entry) => entry.stage === "claimed").receipts, [{ label: "Claim signature", value: "claim-a", source: "session" }]);
  assert.deepEqual(history.find((entry) => entry.stage === "delivered").receipts, [
    { label: "Delivery signature", value: "delivery-a", source: "session" },
    { label: "Evidence SHA-256", value: "aa".repeat(32), source: "solana" },
  ]);
  assert.deepEqual(history.find((entry) => entry.stage === "paid").receipts, [
    { label: "Settlement signature", value: "settlement-a", source: "gateway" },
    { label: "Payout signature", value: "payout-a", source: "session" },
  ]);
});

test("restored claim receipt is shown as receipt-only when Solana still says open", () => {
  const history = buildTaskHistory({
    summary: summary({ status: "open", settlementSignature: undefined }),
    session: session({ deliverySignature: undefined, payoutSignature: undefined, expectedEvidenceHash: undefined }),
    authoritative: authoritative({ status: "open", worker: undefined, evidenceHash: undefined }),
  });
  assert.deepEqual(history.map((entry) => [entry.stage, entry.state]), [["posted", "solana_confirmed"], ["claimed", "receipt_only"]]);
});

test("mismatched authoritative state is ignored instead of confirming the wrong task", () => {
  const history = buildTaskHistory({
    summary: summary({ status: "delivered", settlementSignature: undefined }),
    session: session({ payoutSignature: undefined }),
    authoritative: authoritative({ taskId: "task-b", taskPda: "TaskPdaB", status: "paid" }),
  });
  assert.deepEqual(history.map((entry) => [entry.stage, entry.state]), [
    ["posted", "cached_observation"], ["claimed", "cached_observation"], ["delivered", "cached_observation"],
  ]);
});

test("cancelled authoritative task ends with cancellation instead of fabricating later stages", () => {
  const history = buildTaskHistory({
    summary: summary({ status: "cancelled", settlementSignature: undefined }),
    session: undefined,
    authoritative: authoritative({ status: "cancelled", worker: undefined, evidenceHash: undefined }),
  });
  assert.deepEqual(history.map((entry) => entry.stage), ["posted", "cancelled"]);
  assert.ok(history.every((entry) => entry.state === "solana_confirmed"));
});
