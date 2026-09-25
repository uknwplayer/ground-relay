import type { TaskStatus } from "./types";

const transitions: Record<TaskStatus, readonly TaskStatus[]> = {
  open: ["claimed", "cancelled"],
  claimed: ["delivered", "open", "cancelled"],
  delivered: ["accepted", "claimed"],
  accepted: ["paid"],
  paid: [],
  cancelled: [],
};

export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  return transitions[from].includes(to);
}

export function transition(from: TaskStatus, to: TaskStatus): TaskStatus {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid task transition: ${from} -> ${to}`);
  }
  return to;
}
