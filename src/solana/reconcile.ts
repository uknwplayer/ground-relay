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

const CLAIM_OR_LATER: readonly TaskStatus[] = [
  "claimed",
  "delivered",
  "accepted",
  "paid",
];

const DELIVERY_OR_LATER: readonly TaskStatus[] = [
  "delivered",
  "accepted",
  "paid",
];

export function didExpectedTransitionLand(
  input: ExpectedTransitionInput,
): boolean {
  if (!input.worker || input.worker !== input.walletAddress) {
    return false;
  }

  switch (input.operation) {
    case "claim":
      return CLAIM_OR_LATER.includes(input.status);
    case "submitEvidence":
      return (
        DELIVERY_OR_LATER.includes(input.status) &&
        Boolean(input.expectedEvidenceHash) &&
        input.evidenceHash === input.expectedEvidenceHash
      );
    case "releasePayment":
      return input.status === "paid";
  }
}
