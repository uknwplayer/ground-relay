import assert from "node:assert/strict";
import test from "node:test";

import { resolveListenHost } from "./listen.mjs";

test("production listener defaults to all interfaces for hosted environments", () => {
  assert.equal(resolveListenHost({}), "0.0.0.0");
});

test("production listener honors an explicit HOST override", () => {
  assert.equal(resolveListenHost({ HOST: "127.0.0.1" }), "127.0.0.1");
});
