export type TaskStatus =
  | "open"
  | "claimed"
  | "delivered"
  | "accepted"
  | "paid"
  | "cancelled";

export interface AcceptanceCriterion {
  id: string;
  description: string;
  required: boolean;
}

export interface RelayTask {
  id: string;
  title: string;
  description: string;
  poster: string;
  worker?: string;
  status: TaskStatus;
  rewardAtomic: string;
  rewardMint: string;
  createdAt: string;
  criteria: AcceptanceCriterion[];
  evidenceHash?: string;
  settlementSignature?: string;
}
