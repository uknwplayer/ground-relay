import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");

test("mobile accepted-task flow wires verified generic payout execution", () => {
  assert.match(appSource, /resolveVerifiedPayoutContext/);
  assert.match(appSource, /getReleasePaymentInstruction/);
  assert.match(appSource, /reconcileExpectedTransition\("releasePayment"\)/);
  assert.doesNotMatch(appSource, /Generic payout remains locked until/);
  assert.doesNotMatch(appSource, /Payout verification pending/);
});
