import type {
  InboxTaskSummary,
  MobileStateV1,
  SelectedTaskSession,
} from "./types";

export type RestartStep = "refresh_gateway" | "read_selected_chain";

export interface RestartPlan {
  selectedTask?: InboxTaskSummary;
  session?: SelectedTaskSession;
  taskPda?: string;
  steps: RestartStep[];
}

function findSelectedTask(
  state: MobileStateV1,
): InboxTaskSummary | undefined {
  if (!state.selectedTask) return undefined;
  return state.inboxSnapshot.find(
    (task) => task.id === state.selectedTask?.taskId,
  );
}

export function selectTaskSession(
  task: InboxTaskSummary,
  updatedAt = new Date().toISOString(),
): SelectedTaskSession {
  return {
    taskId: task.id,
    taskPda: task.chain?.taskPda,
    updatedAt,
  };
}

export function buildRestartPlan(state: MobileStateV1): RestartPlan {
  const steps: RestartStep[] = ["refresh_gateway"];
  const task = findSelectedTask(state);
  const session = state.selectedTask;

  if (!task || !session) return { steps };

  const boundPda = task.chain?.taskPda;
  if (session.taskPda && boundPda && session.taskPda !== boundPda) {
    return { steps };
  }

  const taskPda = boundPda;
  const restoredSession: SelectedTaskSession = {
    ...session,
    taskPda,
  };

  if (taskPda) steps.push("read_selected_chain");

  return {
    selectedTask: task,
    session: restoredSession,
    taskPda,
    steps,
  };
}

export function mergeFreshInbox(
  state: MobileStateV1,
  freshInbox: InboxTaskSummary[],
  savedAt = new Date().toISOString(),
): MobileStateV1 {
  const selected = state.selectedTask
    ? freshInbox.find((task) => task.id === state.selectedTask?.taskId)
    : undefined;

  let selectedTask: SelectedTaskSession | undefined;
  if (selected && state.selectedTask) {
    const freshPda = selected.chain?.taskPda;
    const priorPda = state.selectedTask.taskPda;

    if (!priorPda || !freshPda || priorPda === freshPda) {
      selectedTask = {
        ...state.selectedTask,
        taskPda: freshPda,
        updatedAt: savedAt,
      };
    }
  }

  return {
    schemaVersion: 1,
    savedAt,
    inboxSnapshot: freshInbox,
    selectedTask,
  };
}
