import assert from "node:assert/strict";
import test from "node:test";

import { discardCapturedEvidence } from "../src/evidence/retention.ts";
import { serializeMobileState } from "../src/inbox/state.ts";

test("discardCapturedEvidence deletes the local file idempotently", async () => {
  const calls = [];
  const deleted = await discardCapturedEvidence(
    { uri: "file:///tmp/evidence.jpg" },
    async (uri, options) => {
      calls.push({ uri, options });
    },
  );

  assert.equal(deleted, true);
  assert.deepEqual(calls, [
    { uri: "file:///tmp/evidence.jpg", options: { idempotent: true } },
  ]);
});

test("discardCapturedEvidence is a no-op when there is no local capture", async () => {
  let calls = 0;
  const deleted = await discardCapturedEvidence(undefined, async () => {
    calls += 1;
  });

  assert.equal(deleted, false);
  assert.equal(calls, 0);
});

test("discardCapturedEvidence surfaces deletion failures", async () => {
  await assert.rejects(
    discardCapturedEvidence(
      { uri: "file:///tmp/evidence.jpg" },
      async () => {
        throw new Error("delete failed");
      },
    ),
    /delete failed/,
  );
});

test("restart serialization strips local photo uri and bytes", () => {
  const serialized = serializeMobileState({
    schemaVersion: 1,
    savedAt: "2026-09-26T20:30:00.000Z",
    inboxSnapshot: [],
    capturedEvidence: {
      uri: "file:///private/photo.jpg",
      base64: "private-photo-bytes",
    },
  });

  assert.equal(serialized.includes("file:///private/photo.jpg"), false);
  assert.equal(serialized.includes("private-photo-bytes"), false);
});
