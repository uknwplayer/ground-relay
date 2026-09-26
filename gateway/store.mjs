import { mkdir, open, readFile, rename } from "node:fs/promises";
import path from "node:path";

function clone(value) {
  return structuredClone(value);
}

function validateState(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid state object.");
  if (value.schemaVersion !== 1) throw new Error(`Unsupported schemaVersion: ${value.schemaVersion}`);
  if (!value.tasks || typeof value.tasks !== "object" || Array.isArray(value.tasks)) throw new Error("Invalid tasks object.");
  if (!value.idempotency || typeof value.idempotency !== "object" || Array.isArray(value.idempotency)) throw new Error("Invalid idempotency object.");
}

export function createJsonStore({ statePath }) {
  let state;
  let queue = Promise.resolve();
  let nonce = 0;

  async function persist(next) {
    await mkdir(path.dirname(statePath), { recursive: true });
    const tmp = `${statePath}.tmp-${process.pid}-${nonce++}`;
    const handle = await open(tmp, "w");
    try {
      await handle.writeFile(`${JSON.stringify(next, null, 2)}\n`, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(tmp, statePath);
  }

  async function init() {
    try {
      state = JSON.parse(await readFile(statePath, "utf8"));
      validateState(state);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      state = { schemaVersion: 1, tasks: {}, idempotency: {} };
      await persist(state);
    }
    return clone(state);
  }

  async function ensure() {
    if (!state) await init();
  }

  async function transaction(mutator) {
    const run = async () => {
      await ensure();
      const draft = clone(state);
      const result = await mutator(draft);
      await persist(draft);
      state = draft;
      return result;
    };
    const next = queue.then(run, run);
    queue = next.then(() => undefined, () => undefined);
    return next;
  }

  async function readSnapshot() {
    await ensure();
    return clone(state);
  }

  async function getTask(taskId) {
    const snapshot = await readSnapshot();
    return snapshot.tasks[taskId];
  }

  async function listTasks() {
    const snapshot = await readSnapshot();
    return Object.values(snapshot.tasks);
  }

  async function getIdempotency(key) {
    const snapshot = await readSnapshot();
    return snapshot.idempotency[key];
  }

  return { init, transaction, readSnapshot, getTask, listTasks, getIdempotency };
}
