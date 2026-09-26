import assert from "node:assert/strict";
import test from "node:test";

import { decodeGroundRelayTaskAccount } from "./chain.mjs";

const PROGRAM_ID = "6v2peeoZVj2AXfczVLqyMUTHYt3XQPqAxCktpTwjUZap";
const DISCRIMINATOR = [209, 72, 197, 54, 17, 55, 3, 187];

function fixture({ workerByte = 2, evidenceByte = 4, status = 2 } = {}) {
  const data = new Uint8Array(187);
  data.set(DISCRIMINATOR, 0);
  data.fill(9, 8, 40);
  data.fill(1, 40, 72);
  if (workerByte) data.fill(workerByte, 72, 104);
  data.fill(3, 104, 136);
  new DataView(data.buffer).setBigUint64(136, 1_000_000n, true);
  new DataView(data.buffer).setBigInt64(144, 2_000_000_000n, true);
  data[152] = status;
  if (evidenceByte) data.fill(evidenceByte, 153, 185);
  return data;
}

test("chain decoder reads deployed Ground Relay account layout", () => {
  const result = decodeGroundRelayTaskAccount({ data: fixture(), owner: PROGRAM_ID, expectedProgramId: PROGRAM_ID });
  assert.equal(result.taskIdHex, "09".repeat(32));
  assert.equal(result.poster, "4vJ9JU1bJJE96FWSJKvHsmmFADCg4gpZQff4P3bkLKi");
  assert.equal(result.worker, "8qbHbw2BbbTHBW1sbeqakYXVKRQM8Ne7pLK7m6CVfeR");
  assert.equal(result.mint, "CktRuQ2mttgRGkXJtyksdKHjUdc2C4TgDzyB98oEzy8");
  assert.equal(result.rewardAtomic, "1000000");
  assert.equal(result.expiresAt, 2_000_000_000);
  assert.equal(result.status, "delivered");
  assert.equal(result.evidenceHash, "04".repeat(32));
});

test("chain decoder omits zero worker and zero evidence", () => {
  const result = decodeGroundRelayTaskAccount({ data: fixture({ workerByte: 0, evidenceByte: 0, status: 0 }), owner: PROGRAM_ID, expectedProgramId: PROGRAM_ID });
  assert.equal(result.status, "open");
  assert.equal(result.worker, undefined);
  assert.equal(result.evidenceHash, undefined);
});

test("chain decoder rejects wrong account owner", () => {
  assert.throws(() => decodeGroundRelayTaskAccount({ data: fixture(), owner: "11111111111111111111111111111111", expectedProgramId: PROGRAM_ID }), /owner|program/i);
});

test("chain decoder rejects wrong discriminator", () => {
  const data = fixture();
  data[0] ^= 1;
  assert.throws(() => decodeGroundRelayTaskAccount({ data, owner: PROGRAM_ID, expectedProgramId: PROGRAM_ID }), /discriminator/i);
});

test("chain decoder rejects too-short account data", () => {
  assert.throws(() => decodeGroundRelayTaskAccount({ data: new Uint8Array(186), owner: PROGRAM_ID, expectedProgramId: PROGRAM_ID }), /small|length|187/i);
});

test("chain decoder rejects unknown status index", () => {
  assert.throws(() => decodeGroundRelayTaskAccount({ data: fixture({ status: 9 }), owner: PROGRAM_ID, expectedProgramId: PROGRAM_ID }), /status/i);
});
