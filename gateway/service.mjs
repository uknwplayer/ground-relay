import { createHash, randomUUID } from "node:crypto";

import { validateCallbackUrl } from "./callbacks.mjs";

export const GROUND_RELAY_PROGRAM_ID = "6v2peeoZVj2AXfczVLqyMUTHYt3XQPqAxCktpTwjUZap";

const STATUS_RANK = { open: 0, claimed: 1, delivered: 2, accepted: 3, paid: 4 };

function domainError(code, message = code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .filter((key) => value[key] !== undefined)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

function requestHash(input) {
  return createHash("sha256").update(JSON.stringify(canonicalize(input))).digest("hex");
}

function validateCreateInput(input, allowLoopbackHttp) {
  if (
    !input ||
    !input.title ||
    !input.description ||
    !input.poster ||
    !input.rewardAtomic ||
    !input.rewardMint ||
    !input.callbackUrl ||
    !Array.isArray(input.criteria) ||
    input.criteria.length === 0
  ) {
    throw domainError("invalid_task");
  }
  try {
    validateCallbackUrl(input.callbackUrl, { allowLoopbackHttp });
  } catch (error) {
    throw domainError("invalid_task", error.message);
  }
}

export function createRelayService({
  store,
  chain,
  callbackTransport,
  clock = { now: () => Date.now() },
  scheduler,
  allowLoopbackHttp = false,
  programId = GROUND_RELAY_PROGRAM_ID,
}) {
  async function getTask(taskId) {
    const task = await store.getTask(taskId);
    if (!task) throw domainError("task_not_found");
    return task;
  }

  async function createTask(input, { idempotencyKey } = {}) {
    validateCreateInput(input, allowLoopbackHttp);
    const hash = requestHash(input);

    return store.transaction((draft) => {
      if (idempotencyKey) {
        const existing = draft.idempotency[idempotencyKey];
        if (existing) {
          if (existing.requestHash !== hash) throw domainError("idempotency_conflict");
          const prior = draft.tasks[existing.taskId];
          if (!prior) throw domainError("idempotency_conflict");
          return structuredClone(prior);
        }
      }

      const id = input.id ?? randomUUID();
      if (draft.tasks[id]) throw domainError("task_exists");
      const task = {
        id,
        title: input.title,
        description: input.description,
        poster: input.poster,
        status: "open",
        rewardAtomic: String(input.rewardAtomic),
        rewardMint: input.rewardMint,
        createdAt: new Date(clock.now()).toISOString(),
        criteria: structuredClone(input.criteria),
        callbackUrl: input.callbackUrl,
      };
      if (input.expiresAt !== undefined) task.expiresAt = input.expiresAt;
      draft.tasks[id] = task;
      if (idempotencyKey) draft.idempotency[idempotencyKey] = { requestHash: hash, taskId: id };
      return structuredClone(task);
    });
  }

  function assertChainIdentity(task, onChain) {
    if (
      onChain.poster !== task.poster ||
      onChain.mint !== task.rewardMint ||
      String(onChain.rewardAtomic) !== String(task.rewardAtomic)
    ) {
      throw domainError("chain_mismatch");
    }
  }

  async function bindTask(taskId, binding) {
    const task = await getTask(taskId);
    if (!binding || binding.cluster !== "devnet" || binding.programId !== programId || !binding.taskPda || !binding.postSignature) {
      throw domainError("binding_conflict");
    }
    if (task.chain) {
      if (
        task.chain.cluster === binding.cluster &&
        task.chain.programId === binding.programId &&
        task.chain.taskPda === binding.taskPda &&
        task.chain.postSignature === binding.postSignature
      ) return task;
      throw domainError("binding_conflict");
    }

    let onChain;
    try {
      onChain = await chain.readTask(binding.taskPda);
    } catch (error) {
      if (error?.code) throw error;
      throw domainError("chain_unavailable", error instanceof Error ? error.message : String(error));
    }
    assertChainIdentity(task, onChain);
    const observedAt = new Date(clock.now()).toISOString();

    return store.transaction((draft) => {
      const current = draft.tasks[taskId];
      if (!current) throw domainError("task_not_found");
      if (current.chain) {
        if (
          current.chain.cluster === binding.cluster &&
          current.chain.programId === binding.programId &&
          current.chain.taskPda === binding.taskPda &&
          current.chain.postSignature === binding.postSignature
        ) return structuredClone(current);
        throw domainError("binding_conflict");
      }
      for (const [otherId, other] of Object.entries(draft.tasks)) {
        if (otherId !== taskId && other.chain?.taskPda === binding.taskPda) throw domainError("binding_conflict");
      }
      current.chain = {
        cluster: binding.cluster,
        programId: binding.programId,
        taskPda: binding.taskPda,
        postSignature: binding.postSignature,
        boundAt: observedAt,
        lastSyncedAt: observedAt,
      };
      current.status = onChain.status;
      if (onChain.worker) current.worker = onChain.worker;
      if (onChain.evidenceHash) current.evidenceHash = onChain.evidenceHash;
      return structuredClone(current);
    });
  }

  function reconcileStatus(current, onChain) {
    if (current.status === "paid") {
      if (onChain.status === "cancelled") throw domainError("chain_mismatch");
      return current.status;
    }
    if (current.status === "cancelled") {
      if (onChain.status !== "cancelled" && onChain.status !== "open") throw domainError("chain_mismatch");
      return current.status;
    }
    if (onChain.status === "cancelled") {
      if (current.status !== "open") throw domainError("chain_mismatch");
      return "cancelled";
    }
    const currentRank = STATUS_RANK[current.status];
    const chainRank = STATUS_RANK[onChain.status];
    if (currentRank === undefined || chainRank === undefined) throw domainError("chain_mismatch");
    return chainRank < currentRank ? current.status : onChain.status;
  }

  async function syncTask(taskId) {
    const task = await getTask(taskId);
    if (!task.chain) throw domainError("task_not_bound");
    let onChain;
    try {
      onChain = await chain.readTask(task.chain.taskPda);
    } catch (error) {
      if (error?.code === "chain_mismatch") throw error;
      throw domainError("chain_unavailable", error instanceof Error ? error.message : String(error));
    }
    if (onChain.taskPda && onChain.taskPda !== task.chain.taskPda) throw domainError("chain_mismatch");
    assertChainIdentity(task, onChain);
    const observedAt = new Date(clock.now()).toISOString();

    return store.transaction((draft) => {
      const current = draft.tasks[taskId];
      if (!current?.chain) throw domainError("task_not_bound");
      const status = reconcileStatus(current, onChain);
      const advancedOrEqual = status === onChain.status;
      current.status = status;
      current.chain.lastSyncedAt = observedAt;
      if (advancedOrEqual) {
        if (onChain.worker) current.worker = onChain.worker;
        if (onChain.evidenceHash) current.evidenceHash = onChain.evidenceHash;
      }
      return structuredClone(current);
    });
  }

  async function start() {}

  async function claimLocal(taskId, input) {
    return store.transaction((draft) => {
      const task = draft.tasks[taskId];
      if (!task) throw domainError("task_not_found");
      if (task.chain) throw domainError("chain_authoritative");
      if (task.status !== "open") throw domainError("invalid_status");
      if (!input?.worker) throw domainError("worker_required");
      task.worker = input.worker;
      task.status = "claimed";
      if (input.signature !== undefined) task.claimSignature = input.signature;
      return structuredClone(task);
    });
  }

  async function deliverLocal(taskId, input) {
    return store.transaction((draft) => {
      const task = draft.tasks[taskId];
      if (!task) throw domainError("task_not_found");
      if (task.chain) throw domainError("chain_authoritative");
      if (task.status !== "claimed") throw domainError("invalid_status");
      if (!input?.worker || input.worker !== task.worker) throw domainError("wrong_worker");
      if (!/^[a-f0-9]{64}$/.test(input.bundleHash ?? "")) throw domainError("invalid_bundle_hash");
      task.evidenceHash = input.bundleHash;
      task.status = "delivered";
      if (input.signature !== undefined) task.deliverySignature = input.signature;
      return structuredClone(task);
    });
  }

  async function verifyLocal(taskId, input) {
    return store.transaction((draft) => {
      const task = draft.tasks[taskId];
      if (!task) throw domainError("task_not_found");
      if (task.chain) throw domainError("chain_authoritative");
      if (task.status !== "delivered") throw domainError("invalid_status");
      if (input?.poster !== task.poster) throw domainError("wrong_poster");
      task.status = input.accepted === true ? "accepted" : "claimed";
      return structuredClone(task);
    });
  }

  return {
    start,
    createTask,
    getTask,
    bindTask,
    syncTask,
    claimLocal,
    deliverLocal,
    verifyLocal,
  };
}
