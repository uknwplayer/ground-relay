import type { AcceptanceCriterion, TaskStatus } from "../protocol/types";

export interface TaskChainBinding {
  cluster: string;
  programId: string;
  taskPda: string;
  postSignature: string;
  lastSyncedAt: string;
}

export interface InboxTaskSummary {
  id: string;
  title: string;
  description: string;
  poster: string;
  status: TaskStatus;
  worker?: string;
  rewardAtomic: string;
  rewardMint: string;
  createdAt: string;
  expiresAt?: string | number;
  criteria: AcceptanceCriterion[];
  evidenceHash?: string;
  settlementSignature?: string;
  chain?: TaskChainBinding;
}

export interface SelectedTaskSession {
  taskId: string;
  taskPda?: string;
  claimSignature?: string;
  deliverySignature?: string;
  payoutSignature?: string;
  expectedEvidenceHash?: string;
  updatedAt: string;
}

export interface MobileStateV1 {
  schemaVersion: 1;
  savedAt: string;
  inboxSnapshot: InboxTaskSummary[];
  selectedTask?: SelectedTaskSession;
}
