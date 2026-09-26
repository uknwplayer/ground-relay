import assert from "node:assert/strict";
import test from "node:test";

import { runSeededDemo } from "./demo.mjs";

test("seeded demo proves blocked -> bound -> paid -> resumed -> restart without duplicate callback", async () => {
  const proof = await runSeededDemo({ quiet: true });

  assert.equal(proof.taskId, "seeded-agent-blocker");
  assert.equal(proof.status, "paid");
  assert.equal(proof.resumeState, "delivered");
  assert.equal(proof.callbackCount, 1);
  assert.equal(proof.callbackPayload.type, "ground_relay.task.paid");
  assert.equal(proof.callbackPayload.taskId, proof.taskId);
  assert.equal(proof.callbackPayload.status, "paid");
  assert.equal(proof.callbackPayload.settlementSignature, "seeded-settlement-signature");
  assert.equal(proof.callbackIdempotencyKey, `ground-relay:${proof.taskId}:paid:seeded-settlement-signature`);
  assert.match(proof.callbackPayload.eventId, /^[a-f0-9]{64}$/);
  assert.equal(proof.callbackPayload.eventId, proof.persistedEventId);
  assert.equal(proof.restartCallbackCount, 1);
  assert.equal(proof.noDuplicateAfterRestart, true);
});
