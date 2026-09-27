import type { TaskStatus } from "../protocol/types.ts";
import type { PayoutExecutionContext, OnChainRelayTask } from "../solana/ground-relay.ts";
import type { InboxTaskSummary, TaskChainBinding } from "./types.ts";

export const EXPECTED_GROUND_RELAY_PROGRAM_ID =
  "6v2peeoZVj2AXfczVLqyMUTHYt3XQPqAxCktpTwjUZap";

const STATUS_RANK: Record<Exclude<TaskStatus, "cancelled">, number> = {
  open: 0,
  claimed: 1,
  delivered: 2,
  accepted: 3,
  paid: 4,
};

export interface ReconciledTaskState {
  authoritative: true;
  taskId: string;
  taskPda: string;
  taskIdHex: string;
  poster: string;
  worker?: string;
  rewardMint: string;
  rewardAtomic: string;
  expiresAt: number;
  status: TaskStatus;
  evidenceHash?: string;
}

export interface ActionEligibility {
  canClaim: boolean;
  canCapture: boolean;
  canSubmit: boolean;
  canRelease: boolean;
}

type DomainError = Error & { code?: string };

function domainError(code: string, message: string): DomainError {
  const error = new Error(message) as DomainError;
  error.code = code;
  return error;
}

function isExecutableBinding(binding: TaskChainBinding | undefined): binding is TaskChainBinding {
  return Boolean(
    binding &&
      binding.cluster === "devnet" &&
      binding.programId === EXPECTED_GROUND_RELAY_PROGRAM_ID &&
      binding.taskPda,
  );
}

function assertAuthoritativeStatus(summaryStatus: TaskStatus, chainStatus: TaskStatus): void {
  if (summaryStatus === "cancelled") {
    if (chainStatus !== "cancelled") {
      throw domainError("chain_mismatch", "Cancelled task regressed on chain.");
    }
    return;
  }

  if (chainStatus === "cancelled") {
    if (summaryStatus !== "open") {
      throw domainError("chain_mismatch", "Unexpected cancellation after task progress.");
    }
    return;
  }

  const summaryRank = STATUS_RANK[summaryStatus];
  const chainRank = STATUS_RANK[chainStatus];
  if (chainRank < summaryRank) {
    throw domainError("chain_mismatch", "On-chain task status regressed behind observed state.");
  }
}

export function reconcileSelectedTask(
  summary: InboxTaskSummary,
  onChain: OnChainRelayTask,
): ReconciledTaskState {
  if (!summary.chain) {
    throw domainError("task_not_bound", "Task is not bound to Solana.");
  }
  if (!isExecutableBinding(summary.chain)) {
    throw domainError("chain_mismatch", "Task binding does not match the supported devnet program.");
  }

  if (
    onChain.poster !== summary.poster ||
    onChain.mint !== summary.rewardMint ||
    String(onChain.rewardAtomic) !== String(summary.rewardAtomic)
  ) {
    throw domainError("chain_mismatch", "Gateway task identity does not match the selected Solana account.");
  }

  if (/^[a-f0-9]{64}$/i.test(summary.id) && onChain.taskIdHex.toLowerCase() !== summary.id.toLowerCase()) {
    throw domainError("chain_mismatch", "Expected task ID does not match the selected Solana account.");
  }

  assertAuthoritativeStatus(summary.status, onChain.status);

  return {
    authoritative: true,
    taskId: summary.id,
    taskPda: summary.chain.taskPda,
    taskIdHex: onChain.taskIdHex,
    poster: onChain.poster,
    worker: onChain.worker,
    rewardMint: onChain.mint,
    rewardAtomic: String(onChain.rewardAtomic),
    expiresAt: onChain.expiresAt,
    status: onChain.status,
    evidenceHash: onChain.evidenceHash,
  };
}

function payoutContextMatches(
  authoritative: ReconciledTaskState,
  payoutContext: PayoutExecutionContext | undefined,
): boolean {
  return Boolean(
    payoutContext &&
      payoutContext.taskPda === authoritative.taskPda &&
      payoutContext.rewardMint === authoritative.rewardMint &&
      payoutContext.vaultPda &&
      payoutContext.workerTokenAddress,
  );
}

export function deriveActionEligibility({
  summary,
  authoritative,
  walletAddress,
  hasCapturedEvidence = false,
  payoutContext,
}: {
  summary: InboxTaskSummary;
  authoritative?: ReconciledTaskState;
  walletAddress?: string;
  hasCapturedEvidence?: boolean;
  payoutContext?: PayoutExecutionContext;
}): ActionEligibility {
  const locked: ActionEligibility = {
    canClaim: false,
    canCapture: false,
    canSubmit: false,
    canRelease: false,
  };

  if (
    !walletAddress ||
    !authoritative?.authoritative ||
    !isExecutableBinding(summary.chain) ||
    authoritative.taskId !== summary.id ||
    authoritative.taskPda !== summary.chain.taskPda
  ) {
    return locked;
  }

  const assignedToWallet = authoritative.worker === walletAddress;

  return {
    canClaim: authoritative.status === "open",
    canCapture: authoritative.status === "claimed" && assignedToWallet,
    canSubmit:
      authoritative.status === "claimed" && assignedToWallet && hasCapturedEvidence,
    canRelease:
      authoritative.status === "accepted" &&
      assignedToWallet &&
      payoutContextMatches(authoritative, payoutContext),
  };
}
