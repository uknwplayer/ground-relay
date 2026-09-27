import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");

test("selected task never presents Gateway status as authoritative during RPC failure", () => {
  assert.match(appSource, /const displayStatus = authoritative\?\.status;/);
  assert.match(appSource, /const displayWorker = authoritative\?\.worker;/);
  assert.doesNotMatch(
    appSource,
    /authoritative\?\.status \?\? selectedTask\?\.status/,
  );
  assert.doesNotMatch(
    appSource,
    /authoritative\?\.worker \?\? selectedTask\?\.worker/,
  );
});
