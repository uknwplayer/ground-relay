import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRestartPlan,
  mergeFreshInbox,
  selectTaskSession,
} from "../src/inbox/flow.ts";

const PROGRAM_ID = "6v2peeoZVj2AXfczVLqyMUTHYt3XQPqAxCktpTwjUZap";
const CANONICAL = "7knPNeaZHDn7qVzdGy6Qbq3tWnHMnP2TpHULwLKzVtpT";

function task(id, taskPda, status = "open") {
  return {
    id,
    title: `Task ${id}`,
    description: `Description ${id}`,
    poster: "Poster111111111111111111111111111111111",
    status,
    rewardAtomic: "1000",
    rewardMint: "Mint11111111111111111111111111111111111",
    createdAt: "2026-09-26T18:00:00.000Z",
    criteria: [{ id: "photo", description: "Take a photo", required: true }],
    chain: {
      cluster: "devnet",
      programId: PROGRAM_ID,
      taskPda,
      postSignature: `post-${id}`,
      lastSyncedAt: "2026-09-26T18:00:00.000Z",
    },
  };
}

test("restart restores the exact selected task and only schedules reads", () => {
  const taskA = task("a", CANONICAL);
  const taskB = task("b", "TaskB111111111111111111111111111111111111");
  const state = {
    schemaVersion: 1,
    savedAt: "2026-09-26T18:10:00.000Z",
    inboxSnapshot: [taskA, taskB],
    selectedTask: {
      taskId: "b",
      taskPda: taskB.chain.taskPda,
      updatedAt: "2026-09-26T18:10:00.000Z",
    },
  };

  const plan = buildRestartPlan(state);
  assert.equal(plan.selectedTask?.id, "b");
  assert.equal(plan.taskPda, taskB.chain.taskPda);
  assert.deepEqual(plan.steps, ["refresh_gateway", "read_selected_chain"]);
  assert.equal(plan.steps.some((step) => step.includes("transaction")), false);
});

test("restart drops a selected session if its persisted PDA conflicts with the inbox binding", () => {
  const taskB = task("b", "TaskB111111111111111111111111111111111111");
  const state = {
    schemaVersion: 1,
    savedAt: "2026-09-26T18:10:00.000Z",
    inboxSnapshot: [taskB],
    selectedTask: {
      taskId: "b",
      taskPda: "Different111111111111111111111111111111111",
      updatedAt: "2026-09-26T18:10:00.000Z",
    },
  };

  const plan = buildRestartPlan(state);
  assert.equal(plan.selectedTask, undefined);
  assert.equal(plan.taskPda, undefined);
});

test("selecting task B persists task B binding and never falls back to the canonical fixture", () => {
  const taskB = task("b", "TaskB111111111111111111111111111111111111");
  const session = selectTaskSession(taskB, "2026-09-26T18:20:00.000Z");
  assert.equal(session.taskId, "b");
  assert.equal(session.taskPda, taskB.chain.taskPda);
  assert.notEqual(session.taskPda, CANONICAL);
});

test("fresh inbox preserves a valid selected task and drops one that disappeared", () => {
  const taskA = task("a", CANONICAL);
  const taskB = task("b", "TaskB111111111111111111111111111111111111");
  const state = {
    schemaVersion: 1,
    savedAt: "2026-09-26T18:10:00.000Z",
    inboxSnapshot: [taskA, taskB],
    selectedTask: selectTaskSession(taskB, "2026-09-26T18:10:00.000Z"),
  };

  const preserved = mergeFreshInbox(state, [taskA, taskB], "2026-09-26T18:30:00.000Z");
  assert.equal(preserved.selectedTask?.taskId, "b");

  const dropped = mergeFreshInbox(state, [taskA], "2026-09-26T18:31:00.000Z");
  assert.equal(dropped.selectedTask, undefined);
});
