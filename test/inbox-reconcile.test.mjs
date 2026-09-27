import test from "node:test";
import assert from "node:assert/strict";

import {
  deriveActionEligibility,
  reconcileSelectedTask,
} from "../src/inbox/reconcile.ts";

const PROGRAM_ID = "6v2peeoZVj2AXfczVLqyMUTHYt3XQPqAxCktpTwjUZap";
const TASK_PDA = "SelectedTaskPda111111111111111111111111111111";
const POSTER = "Poster1111111111111111111111111111111111111";
const WORKER = "Worker1111111111111111111111111111111111111";
const OTHER_WORKER = "OtherWorker111111111111111111111111111111111";
const MINT = "Mint111111111111111111111111111111111111111";

function summary(overrides = {}) {
  return {
    id: "external-task-1",
    title: "Verify a sign",
    description: "Capture evidence",
    poster: POSTER,
    status: "open",
    rewardAtomic: "1000000",
    rewardMint: MINT,
    createdAt: "2026-09-26T18:00:00.000Z",
    criteria: [{ id: "photo", description: "Take one photo", required: true }],
    chain: {
      cluster: "devnet",
      programId: PROGRAM_ID,
      taskPda: TASK_PDA,
      postSignature: "post-signature",
      lastSyncedAt: "2026-09-26T18:00:00.000Z",
    },
    ...overrides,
  };
}

function onChain(overrides = {}) {
  return {
    taskIdHex: "a".repeat(64),
    poster: POSTER,
    mint: MINT,
    rewardAtomic: "1000000",
    expiresAt: 1_800_000_000,
    status: "open",
    ...overrides,
  };
}

function assertChainMismatch(callback) {
  assert.throws(callback, (error) => error instanceof Error && error.code === "chain_mismatch");
}

test("reconciliation advances cached open state to authoritative claimed state", () => {
  const result = reconcileSelectedTask(
    summary({ status: "open" }),
    onChain({ status: "claimed", worker: WORKER }),
  );

  assert.equal(result.authoritative, true);
  assert.equal(result.taskId, "external-task-1");
  assert.equal(result.taskPda, TASK_PDA);
  assert.equal(result.status, "claimed");
  assert.equal(result.worker, WORKER);
});

test("reconciliation advances cached claimed state to authoritative paid state", () => {
  const result = reconcileSelectedTask(
    summary({ status: "claimed", worker: WORKER }),
    onChain({ status: "paid", worker: WORKER, evidenceHash: "b".repeat(64) }),
  );

  assert.equal(result.status, "paid");
  assert.equal(result.evidenceHash, "b".repeat(64));
});

test("reconciliation rejects poster mint reward and expected task-id mismatches", () => {
  assertChainMismatch(() => reconcileSelectedTask(summary(), onChain({ poster: "wrong-poster" })));
  assertChainMismatch(() => reconcileSelectedTask(summary(), onChain({ mint: "wrong-mint" })));
  assertChainMismatch(() => reconcileSelectedTask(summary(), onChain({ rewardAtomic: "999" })));

  const expectedId = "c".repeat(64);
  assertChainMismatch(() =>
    reconcileSelectedTask(summary({ id: expectedId }), onChain({ taskIdHex: "d".repeat(64) })),
  );
});

test("reconciliation fails closed on invalid binding or regressive chain status", () => {
  assertChainMismatch(() =>
    reconcileSelectedTask(
      summary({ chain: { ...summary().chain, cluster: "mainnet-beta" } }),
      onChain(),
    ),
  );
  assertChainMismatch(() =>
    reconcileSelectedTask(
      summary({ chain: { ...summary().chain, programId: "wrong-program" } }),
      onChain(),
    ),
  );
  assertChainMismatch(() =>
    reconcileSelectedTask(summary({ status: "claimed", worker: WORKER }), onChain({ status: "open" })),
  );
  assertChainMismatch(() =>
    reconcileSelectedTask(summary({ status: "paid", worker: WORKER }), onChain({ status: "open" })),
  );
});

test("action eligibility follows authoritative status and assigned worker", () => {
  const openSummary = summary();
  const open = reconcileSelectedTask(openSummary, onChain({ status: "open" }));
  assert.deepEqual(
    deriveActionEligibility({ summary: openSummary, authoritative: open, walletAddress: WORKER }),
    { canClaim: true, canCapture: false, canSubmit: false, canRelease: false },
  );

  const claimedSummary = summary({ status: "claimed", worker: WORKER });
  const claimed = reconcileSelectedTask(claimedSummary, onChain({ status: "claimed", worker: WORKER }));
  assert.deepEqual(
    deriveActionEligibility({
      summary: claimedSummary,
      authoritative: claimed,
      walletAddress: WORKER,
      hasCapturedEvidence: true,
    }),
    { canClaim: false, canCapture: true, canSubmit: true, canRelease: false },
  );
  assert.equal(
    deriveActionEligibility({
      summary: claimedSummary,
      authoritative: claimed,
      walletAddress: OTHER_WORKER,
      hasCapturedEvidence: true,
    }).canSubmit,
    false,
  );
});

test("payout eligibility requires matching explicit payout execution context", () => {
  const acceptedSummary = summary({ status: "accepted", worker: WORKER });
  const accepted = reconcileSelectedTask(
    acceptedSummary,
    onChain({ status: "accepted", worker: WORKER }),
  );

  const payoutContext = {
    taskPda: TASK_PDA,
    rewardMint: MINT,
    vaultPda: "Vault11111111111111111111111111111111111111",
    workerTokenAddress: "WorkerToken11111111111111111111111111111111",
  };

  assert.equal(
    deriveActionEligibility({
      summary: acceptedSummary,
      authoritative: accepted,
      walletAddress: WORKER,
      payoutContext,
    }).canRelease,
    true,
  );
  assert.equal(
    deriveActionEligibility({
      summary: acceptedSummary,
      authoritative: accepted,
      walletAddress: WORKER,
    }).canRelease,
    false,
  );
  assert.equal(
    deriveActionEligibility({
      summary: acceptedSummary,
      authoritative: accepted,
      walletAddress: WORKER,
      payoutContext: { ...payoutContext, taskPda: "DifferentTask111111111111111111111111111111111" },
    }).canRelease,
    false,
  );
});

test("unbound or unreconciled tasks remain fully read-only", () => {
  const unbound = summary({ chain: undefined });
  assert.deepEqual(
    deriveActionEligibility({ summary: unbound, authoritative: undefined, walletAddress: WORKER }),
    { canClaim: false, canCapture: false, canSubmit: false, canRelease: false },
  );
});
