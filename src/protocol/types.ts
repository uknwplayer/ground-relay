export type TaskStatus =
  | "open"
  | "claimed"
  | "delivered"
  | "accepted"
  | "paid"
  | "cancelled";

export type EvidenceKind = "text" | "photo" | "video" | "url" | "json";

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

export interface EvidenceItem {
  kind: EvidenceKind;
  uri?: string;
  sha256: string;
  note?: string;
}

export interface Delivery {
  taskId: string;
  worker: string;
  submittedAt: string;
  evidence: EvidenceItem[];
  bundleHash: string;
  receiptSignature?: string;
}
