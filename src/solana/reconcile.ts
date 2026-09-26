import type { TaskStatus } from "../protocol/types";

export type RelayTransitionOperation =
  | "claim"
  | "submitEvidence"
  | "releasePayment";

export interface ExpectedTransitionInput {
  operation: RelayTransitionOperation;
  status: TaskStatus;
  worker?: string;
  walletAddress: string;
  evidenceHash?: string;
  expectedEvidenceHash?: string;
}

export function didExpectedTransitionLand(
  _input: ExpectedTransitionInput,
): boolean {
  return false;
}
