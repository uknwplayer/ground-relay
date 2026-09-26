import { createHash } from "node:crypto";

function isLoopbackHost(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
}

export function validateCallbackUrl(value, { allowLoopbackHttp = false } = {}) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Invalid callback URL.");
  }
  if (parsed.protocol === "https:") return parsed;
  if (parsed.protocol === "http:" && allowLoopbackHttp && isLoopbackHost(parsed.hostname)) return parsed;
  throw new Error("Callback URL must use HTTPS, except explicit loopback HTTP in development/test mode.");
}

export function buildResumeEvent({ task, settlementSignature, paidAtObserved }) {
  const idempotencyKey = `ground-relay:${task.id}:paid:${settlementSignature}`;
  const eventId = createHash("sha256").update(idempotencyKey).digest("hex");
  const payload = {
    type: "ground_relay.task.paid",
    eventId,
    taskId: task.id,
    status: "paid",
    taskPda: task.chain?.taskPda,
    evidenceHash: task.evidenceHash,
    settlementSignature,
    worker: task.worker,
    rewardAtomic: task.rewardAtomic,
    rewardMint: task.rewardMint,
    paidAtObserved,
  };
  return { eventId, idempotencyKey, payload };
}

function classifyStatus(status) {
  if (status >= 200 && status < 300) return "delivered";
  if ([408, 425, 429].includes(status) || status >= 500) return "retryable_failure";
  return "terminal_failure";
}

export async function sendResumeCallback({
  url,
  eventId,
  idempotencyKey,
  payload,
  fetchImpl = fetch,
  timeoutMs = 5000,
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "Idempotency-Key": idempotencyKey,
        "X-Ground-Relay-Event-Id": eventId,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    return {
      classification: classifyStatus(response.status),
      statusCode: response.status,
    };
  } catch (error) {
    return {
      classification: "retryable_failure",
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}
