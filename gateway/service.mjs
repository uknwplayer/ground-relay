import {
  createRelayService as createCoreRelayService,
  GROUND_RELAY_PROGRAM_ID,
} from "./service-core.mjs";

export { GROUND_RELAY_PROGRAM_ID };

function projectWorkerTask(task) {
  const projected = {
    id: task.id,
    title: task.title,
    description: task.description,
    poster: task.poster,
    status: task.status,
    rewardAtomic: task.rewardAtomic,
    rewardMint: task.rewardMint,
    createdAt: task.createdAt,
    criteria: structuredClone(task.criteria),
  };

  for (const key of ["worker", "expiresAt", "evidenceHash", "settlementSignature"]) {
    if (task[key] !== undefined) projected[key] = task[key];
  }

  if (task.chain) {
    projected.chain = {
      cluster: task.chain.cluster,
      programId: task.chain.programId,
      taskPda: task.chain.taskPda,
      postSignature: task.chain.postSignature,
      lastSyncedAt: task.chain.lastSyncedAt,
    };
  }

  return projected;
}

function compareWorkerTasks(left, right) {
  const byCreatedAt = right.createdAt.localeCompare(left.createdAt);
  return byCreatedAt || left.id.localeCompare(right.id);
}

export function createRelayService(options) {
  const service = createCoreRelayService(options);

  async function listTasks() {
    const tasks = await options.store.listTasks();
    return tasks.map(projectWorkerTask).sort(compareWorkerTasks);
  }

  return { ...service, listTasks };
}
