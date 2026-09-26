import test from "node:test";
import assert from "node:assert/strict";

import { didExpectedTransitionLand } from "../src/solana/reconcile.ts";

const worker = "7XY6t1adc9vmuefiEP25TsoEjxRkFhVxT4yQrtN5zr2C";
const evidenceHash = "7d29069a59aec691ef133d7b7813cdd6e0d4a2ffc807e0887f9a5ad5a59ba802";

test("reconciles a claim when the wallet returns cancellation after the chain advanced", () => {
  assert.equal(
    didExpectedTransitionLand({
      operation: "claim",
      status: "claimed",
      worker,
      walletAddress: worker,
    }),
    true,
  );
});

test("reconciles evidence only when the delivered hash matches", () => {
  assert.equal(
    didExpectedTransitionLand({
      operation: "submitEvidence",
      status: "delivered",
      worker,
      walletAddress: worker,
      evidenceHash,
      expectedEvidenceHash: evidenceHash,
    }),
    true,
  );

  assert.equal(
    didExpectedTransitionLand({
      operation: "submitEvidence",
      status: "delivered",
      worker,
      walletAddress: worker,
      evidenceHash: "0".repeat(64),
      expectedEvidenceHash: evidenceHash,
    }),
    false,
  );
});

test("reconciles payout only after the task is paid to the assigned worker", () => {
  assert.equal(
    didExpectedTransitionLand({
      operation: "releasePayment",
      status: "paid",
      worker,
      walletAddress: worker,
    }),
    true,
  );

  assert.equal(
    didExpectedTransitionLand({
      operation: "releasePayment",
      status: "accepted",
      worker,
      walletAddress: worker,
    }),
    false,
  );
});

test("never reconciles a transition for a different worker", () => {
  assert.equal(
    didExpectedTransitionLand({
      operation: "claim",
      status: "claimed",
      worker: "11111111111111111111111111111111",
      walletAddress: worker,
    }),
    false,
  );
});
