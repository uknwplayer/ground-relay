import type { TaskStatus } from "../protocol/types.ts";
import type { ReconciledTaskState } from "./reconcile.ts";
import type { InboxTaskSummary, SelectedTaskSession } from "./types.ts";

export type TaskHistoryStage =
  | "posted"
  | "claimed"
  | "delivered"
  | "accepted"
  | "paid"
  | "cancelled";

export type TaskHistoryState =
  | "solana_confirmed"
  | "cached_observation"
  | "receipt_only";

export type TaskHistoryReceiptSource = "solana" | "gateway" | "session";

export interface TaskHistoryReceipt {
  label: string;
  value: string;
  source: TaskHistoryReceiptSource;
}

export interface TaskHistoryEntry {
  stage: TaskHistoryStage;
  title: string;
  state: TaskHistoryState;
  receipts: TaskHistoryReceipt[];
}

const STATUS_RANK: Partial<Record<TaskStatus, number>> = {
  open: 0,
  claimed: 1,
  delivered: 2,
  accepted: 3,
  paid: 4,
};

function authoritativeMatches(
  summary: InboxTaskSummary,
  authoritative: ReconciledTaskState | undefined,
): authoritative is ReconciledTaskState {
  return Boolean(
    authoritative?.authoritative &&
      authoritative.taskId === summary.id &&
      summary.chain?.taskPda &&
      authoritative.taskPda === summary.chain.taskPda,
  );
}

function sessionMatches(
  summary: InboxTaskSummary,
  session: SelectedTaskSession | undefined,
): session is SelectedTaskSession {
  if (!session || session.taskId !== summary.id) return false;
  if (
    session.taskPda &&
    summary.chain?.taskPda &&
    session.taskPda !== summary.chain.taskPda
  ) {
    return false;
  }
  return true;
}

function reached(status: TaskStatus, stage: Exclude<TaskHistoryStage, "posted" | "cancelled">): boolean {
  const rank = STATUS_RANK[status];
  const target = STATUS_RANK[stage];
  return rank !== undefined && target !== undefined && rank >= target;
}

function observedState(hasAuthoritativeMatch: boolean): TaskHistoryState {
  return hasAuthoritativeMatch ? "solana_confirmed" : "cached_observation";
}

export function buildTaskHistory({
  summary,
  session,
  authoritative,
}: {
  summary: InboxTaskSummary;
  session?: SelectedTaskSession;
  authoritative?: ReconciledTaskState;
}): TaskHistoryEntry[] {
  const hasAuthoritativeMatch = authoritativeMatches(summary, authoritative);
  const safeSession = sessionMatches(summary, session) ? session : undefined;
  const status = hasAuthoritativeMatch ? authoritative.status : summary.status;
  const observed = observedState(hasAuthoritativeMatch);
  const entries: TaskHistoryEntry[] = [];

  const postedReceipts: TaskHistoryReceipt[] = [];
  if (summary.chain?.postSignature) {
    postedReceipts.push({
      label: "Post signature",
      value: summary.chain.postSignature,
      source: "gateway",
    });
  }
  entries.push({
    stage: "posted",
    title: "Task posted",
    state: observed,
    receipts: postedReceipts,
  });

  if (status === "cancelled") {
    entries.push({
      stage: "cancelled",
      title: "Task cancelled",
      state: observed,
      receipts: [],
    });
    return entries;
  }

  const claimObserved = reached(status, "claimed");
  if (claimObserved || safeSession?.claimSignature) {
    const receipts: TaskHistoryReceipt[] = [];
    if (safeSession?.claimSignature) {
      receipts.push({
        label: "Claim signature",
        value: safeSession.claimSignature,
        source: "session",
      });
    }
    entries.push({
      stage: "claimed",
      title: "Task claimed",
      state: claimObserved ? observed : "receipt_only",
      receipts,
    });
  }

  const deliveryObserved = reached(status, "delivered");
  const evidenceReceipt =
    hasAuthoritativeMatch && authoritative.evidenceHash
      ? { label: "Evidence SHA-256", value: authoritative.evidenceHash, source: "solana" as const }
      : safeSession?.expectedEvidenceHash
        ? { label: "Evidence SHA-256", value: safeSession.expectedEvidenceHash, source: "session" as const }
        : summary.evidenceHash
          ? { label: "Evidence SHA-256", value: summary.evidenceHash, source: "gateway" as const }
          : undefined;

  if (deliveryObserved || safeSession?.deliverySignature || evidenceReceipt) {
    const receipts: TaskHistoryReceipt[] = [];
    if (safeSession?.deliverySignature) {
      receipts.push({
        label: "Delivery signature",
        value: safeSession.deliverySignature,
        source: "session",
      });
    }
    if (evidenceReceipt) receipts.push(evidenceReceipt);
    entries.push({
      stage: "delivered",
      title: "Evidence delivered",
      state: deliveryObserved ? observed : "receipt_only",
      receipts,
    });
  }

  if (reached(status, "accepted")) {
    entries.push({
      stage: "accepted",
      title: "Delivery accepted",
      state: observed,
      receipts: [],
    });
  }

  const paidObserved = reached(status, "paid");
  if (paidObserved || summary.settlementSignature || safeSession?.payoutSignature) {
    const receipts: TaskHistoryReceipt[] = [];
    if (summary.settlementSignature) {
      receipts.push({
        label: "Settlement signature",
        value: summary.settlementSignature,
        source: "gateway",
      });
    }
    if (safeSession?.payoutSignature) {
      receipts.push({
        label: "Payout signature",
        value: safeSession.payoutSignature,
        source: "session",
      });
    }
    entries.push({
      stage: "paid",
      title: "Escrow paid",
      state: paidObserved ? observed : "receipt_only",
      receipts,
    });
  }

  return entries;
}
