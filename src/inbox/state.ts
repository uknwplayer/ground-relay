import { parseInboxResponse } from "./api.ts";
import type { InboxTaskSummary, MobileStateV1, SelectedTaskSession } from "./types";

export const MOBILE_STATE_KEY = "ground-relay/mobile-state/v1";

const SESSION_KEYS = new Set([
  "taskId",
  "taskPda",
  "claimSignature",
  "deliverySignature",
  "payoutSignature",
  "expectedEvidenceHash",
  "updatedAt",
]);

const SHA256_HEX = /^[a-f0-9]{64}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validDate(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && Number.isFinite(Date.parse(value));
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function parseSelectedTask(value: unknown): SelectedTaskSession | undefined {
  if (value === undefined || value === null) return undefined;
  if (!isRecord(value)) return undefined;

  for (const key of Object.keys(value)) {
    if (!SESSION_KEYS.has(key)) return undefined;
  }

  if (!nonEmptyString(value.taskId) || !validDate(value.updatedAt)) return undefined;

  const optionalKeys = [
    "taskPda",
    "claimSignature",
    "deliverySignature",
    "payoutSignature",
  ] as const;

  for (const key of optionalKeys) {
    const field = value[key];
    if (field !== undefined && field !== null && !nonEmptyString(field)) return undefined;
  }

  const expectedEvidenceHash = value.expectedEvidenceHash;
  if (
    expectedEvidenceHash !== undefined &&
    expectedEvidenceHash !== null &&
    (!nonEmptyString(expectedEvidenceHash) || !SHA256_HEX.test(expectedEvidenceHash))
  ) {
    return undefined;
  }

  const session: SelectedTaskSession = {
    taskId: value.taskId,
    updatedAt: value.updatedAt,
  };

  if (nonEmptyString(value.taskPda)) session.taskPda = value.taskPda;
  if (nonEmptyString(value.claimSignature)) session.claimSignature = value.claimSignature;
  if (nonEmptyString(value.deliverySignature)) session.deliverySignature = value.deliverySignature;
  if (nonEmptyString(value.payoutSignature)) session.payoutSignature = value.payoutSignature;
  if (nonEmptyString(expectedEvidenceHash)) session.expectedEvidenceHash = expectedEvidenceHash;

  return session;
}

function parseInboxSnapshot(value: unknown): InboxTaskSummary[] {
  if (!Array.isArray(value)) return [];

  const tasks: InboxTaskSummary[] = [];
  for (const item of value) {
    try {
      const [task] = parseInboxResponse({ tasks: [item] });
      if (task) tasks.push(task);
    } catch {
      // Corrupt cached items are ignored individually; they never become authority.
    }
  }
  return tasks;
}

export function emptyMobileState(): MobileStateV1 {
  return {
    schemaVersion: 1,
    savedAt: new Date().toISOString(),
    inboxSnapshot: [],
  };
}

export function parseMobileState(raw: string | null): MobileStateV1 {
  if (raw === null) return emptyMobileState();

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return emptyMobileState();
  }

  if (
    !isRecord(parsed) ||
    parsed.schemaVersion !== 1 ||
    !validDate(parsed.savedAt) ||
    !Array.isArray(parsed.inboxSnapshot)
  ) {
    return emptyMobileState();
  }

  const state: MobileStateV1 = {
    schemaVersion: 1,
    savedAt: parsed.savedAt,
    inboxSnapshot: parseInboxSnapshot(parsed.inboxSnapshot),
  };

  const selectedTask = parseSelectedTask(parsed.selectedTask);
  if (selectedTask) state.selectedTask = selectedTask;

  return state;
}

export function serializeMobileState(state: MobileStateV1): string {
  return JSON.stringify(parseMobileState(JSON.stringify(state)));
}
