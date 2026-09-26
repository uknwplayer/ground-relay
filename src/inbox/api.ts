import type { AcceptanceCriterion } from "../protocol/types";
import type { InboxTaskSummary, TaskChainBinding } from "./types";

export type InboxClientErrorCode = "gateway_unavailable" | "invalid_response";

export class InboxClientError extends Error {
  readonly code: InboxClientErrorCode;
  readonly status?: number;

  constructor(code: InboxClientErrorCode, message: string, status?: number) {
    super(message);
    this.name = "InboxClientError";
    this.code = code;
    this.status = status;
  }
}

const TASK_STATUSES = new Set([
  "open",
  "claimed",
  "delivered",
  "accepted",
  "paid",
  "cancelled",
]);

const TASK_KEYS = new Set([
  "id",
  "title",
  "description",
  "poster",
  "status",
  "worker",
  "rewardAtomic",
  "rewardMint",
  "createdAt",
  "expiresAt",
  "criteria",
  "evidenceHash",
  "settlementSignature",
  "chain",
]);

const CHAIN_KEYS = new Set([
  "cluster",
  "programId",
  "taskPda",
  "postSignature",
  "lastSyncedAt",
]);

const CRITERION_KEYS = new Set(["id", "description", "required"]);
const SHA256_HEX = /^[a-f0-9]{64}$/;
const ATOMIC_INTEGER = /^(0|[1-9][0-9]*)$/;

function invalid(message = "Invalid Gateway inbox response."): never {
  throw new InboxClientError("invalid_response", message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertOnlyKeys(record: Record<string, unknown>, allowed: Set<string>): void {
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) invalid(`Unexpected Gateway inbox field: ${key}`);
  }
}

function requiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) invalid(`Invalid ${key}.`);
  return value;
}

function optionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string" || value.length === 0) invalid(`Invalid ${key}.`);
  return value;
}

function requiredDateString(record: Record<string, unknown>, key: string): string {
  const value = requiredString(record, key);
  if (!Number.isFinite(Date.parse(value))) invalid(`Invalid ${key}.`);
  return value;
}

function parseCriterion(value: unknown): AcceptanceCriterion {
  if (!isRecord(value)) invalid("Invalid acceptance criterion.");
  assertOnlyKeys(value, CRITERION_KEYS);
  const required = value.required;
  if (typeof required !== "boolean") invalid("Invalid acceptance criterion required flag.");
  return {
    id: requiredString(value, "id"),
    description: requiredString(value, "description"),
    required,
  };
}

function parseChain(value: unknown): TaskChainBinding | undefined {
  if (value === undefined || value === null) return undefined;
  if (!isRecord(value)) invalid("Invalid chain binding.");
  assertOnlyKeys(value, CHAIN_KEYS);
  return {
    cluster: requiredString(value, "cluster"),
    programId: requiredString(value, "programId"),
    taskPda: requiredString(value, "taskPda"),
    postSignature: requiredString(value, "postSignature"),
    lastSyncedAt: requiredDateString(value, "lastSyncedAt"),
  };
}

function parseExpiresAt(value: unknown): string | number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) invalid("Invalid expiresAt.");
    return value;
  }
  if (typeof value === "string" && Number.isFinite(Date.parse(value))) return value;
  return invalid("Invalid expiresAt.");
}

function parseTask(value: unknown): InboxTaskSummary {
  if (!isRecord(value)) invalid("Invalid task summary.");
  assertOnlyKeys(value, TASK_KEYS);

  const status = requiredString(value, "status");
  if (!TASK_STATUSES.has(status)) invalid("Invalid task status.");

  const rewardAtomic = requiredString(value, "rewardAtomic");
  if (!ATOMIC_INTEGER.test(rewardAtomic)) invalid("Invalid rewardAtomic.");

  const criteriaValue = value.criteria;
  if (!Array.isArray(criteriaValue) || criteriaValue.length === 0) invalid("Invalid criteria.");

  const evidenceHash = optionalString(value, "evidenceHash");
  if (evidenceHash && !SHA256_HEX.test(evidenceHash)) invalid("Invalid evidenceHash.");

  const task: InboxTaskSummary = {
    id: requiredString(value, "id"),
    title: requiredString(value, "title"),
    description: requiredString(value, "description"),
    poster: requiredString(value, "poster"),
    status: status as InboxTaskSummary["status"],
    rewardAtomic,
    rewardMint: requiredString(value, "rewardMint"),
    createdAt: requiredDateString(value, "createdAt"),
    criteria: criteriaValue.map(parseCriterion),
  };

  const worker = optionalString(value, "worker");
  const expiresAt = parseExpiresAt(value.expiresAt);
  const settlementSignature = optionalString(value, "settlementSignature");
  const chain = parseChain(value.chain);

  if (worker) task.worker = worker;
  if (expiresAt !== undefined) task.expiresAt = expiresAt;
  if (evidenceHash) task.evidenceHash = evidenceHash;
  if (settlementSignature) task.settlementSignature = settlementSignature;
  if (chain) task.chain = chain;

  return task;
}

function normalizeBaseUrl(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return undefined;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined;
  return trimmed.replace(/\/+$/, "");
}

export function parseInboxResponse(input: unknown): InboxTaskSummary[] {
  if (!isRecord(input)) invalid();
  assertOnlyKeys(input, new Set(["tasks"]));
  if (!Array.isArray(input.tasks)) invalid();
  return input.tasks.map(parseTask);
}

export async function fetchTaskInbox(
  baseUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<InboxTaskSummary[]> {
  const resolved = normalizeBaseUrl(baseUrl);
  if (!resolved) {
    throw new InboxClientError("gateway_unavailable", "Invalid Gateway base URL.");
  }

  let response: Response;
  try {
    response = await fetchImpl(`${resolved}/tasks`, {
      method: "GET",
      headers: { accept: "application/json" },
    });
  } catch {
    throw new InboxClientError("gateway_unavailable", "Ground Relay Gateway is unavailable.");
  }

  if (!response.ok) {
    throw new InboxClientError(
      "gateway_unavailable",
      `Ground Relay Gateway returned HTTP ${response.status}.`,
      response.status,
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    invalid("Ground Relay Gateway returned invalid JSON.");
  }
  return parseInboxResponse(body);
}
