import assert from "node:assert/strict";
import test from "node:test";

import {
  MOBILE_STATE_KEY,
  emptyMobileState,
  parseMobileState,
  serializeMobileState,
} from "../src/inbox/state.ts";
import { loadMobileState, saveMobileState } from "../src/inbox/storage.ts";

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

function validState() {
  return {
    schemaVersion: 1,
    savedAt: "2026-09-26T12:05:00.000Z",
    inboxSnapshot: [
      validTask({
        chain: {
          cluster: "devnet",
          programId: PROGRAM_ID,
          taskPda: "TaskPda111",
          postSignature: "post-signature",
          lastSyncedAt: "2026-09-26T12:04:00.000Z",
        },
      }),
    ],
    selectedTask: {
      taskId: "task-a",
      taskPda: "TaskPda111",
      claimSignature: "claim-signature",
      expectedEvidenceHash: "ab".repeat(32),
      updatedAt: "2026-09-26T12:05:00.000Z",
    },
  };
}

test("emptyMobileState creates a clean versioned envelope", () => {
  const state = emptyMobileState();
  assert.equal(state.schemaVersion, 1);
  assert.deepEqual(state.inboxSnapshot, []);
  assert.equal(state.selectedTask, undefined);
  assert.ok(Number.isFinite(Date.parse(state.savedAt)));
});

test("parseMobileState fails closed for missing, corrupt, or unsupported state", () => {
  for (const raw of [
    null,
    "{not-json",
    JSON.stringify({ schemaVersion: 2, savedAt: "2026-09-26T12:00:00.000Z", inboxSnapshot: [] }),
  ]) {
    const state = parseMobileState(raw);
    assert.equal(state.schemaVersion, 1);
    assert.deepEqual(state.inboxSnapshot, []);
    assert.equal(state.selectedTask, undefined);
  }
});

test("serializeMobileState and parseMobileState round-trip safe restart context", () => {
  const state = validState();
  assert.deepEqual(parseMobileState(serializeMobileState(state)), state);
});

test("parseMobileState filters malformed inbox items and discards an invalid selected session", () => {
  const raw = JSON.stringify({
    schemaVersion: 1,
    savedAt: "2026-09-26T12:05:00.000Z",
    inboxSnapshot: [validTask(), validTask({ id: "bad", status: "mystery" })],
    selectedTask: {
      taskId: "task-a",
      taskPda: "TaskPda111",
      updatedAt: "not-a-date",
    },
  });

  const state = parseMobileState(raw);
  assert.deepEqual(state.inboxSnapshot.map((task) => task.id), ["task-a"]);
  assert.equal(state.selectedTask, undefined);
});

test("storage adapter round-trips through the versioned key with injected storage", async () => {
  const values = new Map();
  const storage = {
    async getItem(key) {
      return values.get(key) ?? null;
    },
    async setItem(key, value) {
      values.set(key, value);
    },
  };

  const state = validState();
  await saveMobileState(state, storage);
  assert.equal(values.has(MOBILE_STATE_KEY), true);
  assert.deepEqual(await loadMobileState(storage), state);
});

test("loadMobileState fails closed when storage access throws", async () => {
  const storage = {
    async getItem() {
      throw new Error("storage unavailable");
    },
    async setItem() {},
  };

  const state = await loadMobileState(storage);
  assert.equal(state.schemaVersion, 1);
  assert.deepEqual(state.inboxSnapshot, []);
  assert.equal(state.selectedTask, undefined);
});
