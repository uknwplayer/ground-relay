import assert from "node:assert/strict";
import test from "node:test";

import {
  GROUND_RELAY_TASK_ADDRESS,
  fetchGroundRelayTask,
  getClaimTaskInstruction,
  getReleasePaymentInstruction,
  getSubmitEvidenceInstruction,
} from "../src/solana/ground-relay.ts";

const worker = "7XY6t1adc9vmuefiEP25TsoEjxRkFhVxT4yQrtN5zr2C";
const taskA = GROUND_RELAY_TASK_ADDRESS.toString();
const taskB = "6WG3UpKV9vBRh4XR961eZGpPZcHVGdxqpM3Eten5quuZ";
const rewardMint = "So11111111111111111111111111111111111111112";
const vaultPda = "FGaGmGu8cbYRbdsUubmLDDRNnjic5NutnCM4kFL77bZm";
const workerTokenAddress = "2fm8p8DpCeJvcpvNbCpzURRezQthF2z2yQARLgPgZfu6";
const evidenceHash = "7d29069a59aec691ef133d7b7813cdd6e0d4a2ffc807e0887f9a5ad5a59ba802";

test("claim and evidence instructions target the explicit selected task PDA", () => {
  const claimA = getClaimTaskInstruction(worker, taskA);
  const claimB = getClaimTaskInstruction(worker, taskB);
  assert.equal(claimA.accounts?.[1]?.address.toString(), taskA);
  assert.equal(claimB.accounts?.[1]?.address.toString(), taskB);

  const evidenceB = getSubmitEvidenceInstruction(worker, taskB, evidenceHash);
  assert.equal(evidenceB.accounts?.[1]?.address.toString(), taskB);
});

test("fetchGroundRelayTask reads the explicit selected task PDA", async () => {
  const requested = [];
  const rpc = {
    getAccountInfo(accountAddress) {
      requested.push(accountAddress.toString());
      return { send: async () => ({ value: null }) };
    },
  };

  await assert.rejects(() => fetchGroundRelayTask(rpc, taskB), /was not found/);
  assert.deepEqual(requested, [taskB]);
});

test("release payment requires and uses an explicit payout execution context", () => {
  const context = { taskPda: taskB, rewardMint, vaultPda, workerTokenAddress };
  const instruction = getReleasePaymentInstruction(worker, context);
  assert.deepEqual(
    instruction.accounts?.slice(1, 5).map((account) => account.address.toString()),
    [taskB, rewardMint, vaultPda, workerTokenAddress],
  );

  assert.throws(
    () => getReleasePaymentInstruction(worker, undefined),
    /payout execution context/i,
  );
});

test("generic selected-task builders never fall back to the canonical fixture PDA", () => {
  const claim = getClaimTaskInstruction(worker, taskB);
  const evidence = getSubmitEvidenceInstruction(worker, taskB, evidenceHash);
  const payout = getReleasePaymentInstruction(worker, {
    taskPda: taskB,
    rewardMint,
    vaultPda,
    workerTokenAddress,
  });

  assert.notEqual(claim.accounts?.[1]?.address.toString(), taskA);
  assert.notEqual(evidence.accounts?.[1]?.address.toString(), taskA);
  assert.notEqual(payout.accounts?.[1]?.address.toString(), taskA);
});
