import { createHash } from "node:crypto";
import { lookup as dnsLookup } from "node:dns/promises";
import * as http from "node:http";
import * as https from "node:https";
import { BlockList, isIP } from "node:net";

const BLOCKED_ADDRESSES = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
]) {
  BLOCKED_ADDRESSES.addSubnet(network, prefix, "ipv4");
}
for (const [network, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["100::", 64],
  ["2001::", 32],
  ["2001:2::", 48],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
]) {
  BLOCKED_ADDRESSES.addSubnet(network, prefix, "ipv6");
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

class CallbackPolicyError extends Error {
  constructor(message) {
    super(message);
    this.name = "CallbackPolicyError";
  }
}

function bareHostname(hostname) {
  return hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
}

function isLoopbackHost(hostname) {
  const value = bareHostname(hostname).toLowerCase();
  return value === "localhost" || value === "127.0.0.1" || value === "::1";
}

function isLoopbackAddress(address) {
  const value = bareHostname(address).toLowerCase();
  return value === "::1" || (isIP(value) === 4 && value.startsWith("127."));
}

function mappedIpv4Address(address) {
  const value = bareHostname(address).toLowerCase();
  if (!value.startsWith("::ffff:")) return undefined;
  const suffix = value.slice("::ffff:".length);
  if (isIP(suffix) === 4) return suffix;
  const parts = suffix.split(":");
  if (
    parts.length !== 2 ||
    parts.some((part) => !/^[0-9a-f]{1,4}$/.test(part))
  ) {
    return undefined;
  }
  const high = Number.parseInt(parts[0], 16);
  const low = Number.parseInt(parts[1], 16);
  return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
}

function isPublicAddress(address) {
  const value = bareHostname(address);
  const family = isIP(value);
  if (family === 4) return !BLOCKED_ADDRESSES.check(value, "ipv4");
  if (family === 6) {
    const mapped = mappedIpv4Address(value);
    if (mapped) return isPublicAddress(mapped);
    return !BLOCKED_ADDRESSES.check(value, "ipv6");
  }
  return false;
}

export function validateCallbackUrl(value, { allowLoopbackHttp = false } = {}) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new CallbackPolicyError("Invalid callback URL.");
  }
  if (parsed.username || parsed.password) {
    throw new CallbackPolicyError("Callback URL must not contain credentials.");
  }
  if (
    parsed.protocol === "http:" &&
    allowLoopbackHttp &&
    isLoopbackHost(parsed.hostname)
  ) {
    return parsed;
  }
  if (parsed.protocol !== "https:") {
    throw new CallbackPolicyError(
      "Callback URL must use HTTPS, except explicit loopback HTTP in development/test mode.",
    );
  }
  if (isLoopbackHost(parsed.hostname)) {
    throw new CallbackPolicyError("Callback URL must resolve to a public address.");
  }
  const literal = bareHostname(parsed.hostname);
  if (isIP(literal) && !isPublicAddress(literal)) {
    throw new CallbackPolicyError("Callback URL must use a public address.");
  }
  return parsed;
}

export async function resolveCallbackTarget(
  value,
  { allowLoopbackHttp = false, lookupImpl = dnsLookup } = {},
) {
  const url = validateCallbackUrl(value, { allowLoopbackHttp });
  const hostname = bareHostname(url.hostname);
  const literalFamily = isIP(hostname);
  if (literalFamily) {
    if (
      url.protocol === "http:" &&
      allowLoopbackHttp &&
      isLoopbackAddress(hostname)
    ) {
      return { url, address: hostname, family: literalFamily };
    }
    if (!isPublicAddress(hostname)) {
      throw new CallbackPolicyError("Callback URL must use a public address.");
    }
    return { url, address: hostname, family: literalFamily };
  }

  let records;
  try {
    records = await lookupImpl(hostname, { all: true, verbatim: true });
  } catch (error) {
    throw new Error(
      `Callback DNS resolution failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  const answers = Array.isArray(records) ? records : [records];
  if (answers.length === 0) {
    throw new Error("Callback DNS resolution returned no addresses.");
  }

  if (
    url.protocol === "http:" &&
    allowLoopbackHttp &&
    hostname.toLowerCase() === "localhost"
  ) {
    if (!answers.every((entry) => isLoopbackAddress(entry.address))) {
      throw new CallbackPolicyError(
        "Loopback development callback resolved outside loopback.",
      );
    }
    return {
      url,
      address: answers[0].address,
      family: answers[0].family,
    };
  }

  if (!answers.every((entry) => isPublicAddress(entry.address))) {
    throw new CallbackPolicyError(
      "Callback URL resolved to an unsafe or non-public address.",
    );
  }
  return {
    url,
    address: answers[0].address,
    family: answers[0].family,
  };
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
  if ([408, 425, 429].includes(status) || status >= 500) {
    return "retryable_failure";
  }
  return "terminal_failure";
}

async function requestPinnedCallback({
  url,
  address,
  family,
  headers,
  body,
  timeoutMs,
}) {
  return new Promise((resolve, reject) => {
    const hostname = bareHostname(url.hostname);
    const transport = url.protocol === "https:" ? https : http;
    const request = transport.request(
      {
        protocol: url.protocol,
        hostname,
        port: url.port || undefined,
        method: "POST",
        path: `${url.pathname}${url.search}`,
        headers,
        ...(url.protocol === "https:" && !isIP(hostname)
          ? { servername: hostname }
          : {}),
        lookup(_hostname, _options, callback) {
          callback(null, address, family);
        },
      },
      (response) => {
        response.resume();
        resolve({
          statusCode: response.statusCode ?? 0,
          headers: response.headers,
        });
      },
    );
    request.once("error", reject);
    request.setTimeout(timeoutMs, () =>
      request.destroy(new Error("callback_timeout")),
    );
    request.end(body);
  });
}

export async function sendResumeCallback({
  url,
  eventId,
  idempotencyKey,
  payload,
  timeoutMs = 5000,
  maxRedirects = 3,
  allowLoopbackHttp = false,
  lookupImpl = dnsLookup,
  requestImpl = requestPinnedCallback,
}) {
  const headers = {
    "content-type": "application/json",
    "Idempotency-Key": idempotencyKey,
    "X-Ground-Relay-Event-Id": eventId,
  };
  const body = JSON.stringify(payload);
  let currentUrl = url;

  for (let redirects = 0; ; redirects += 1) {
    let target;
    try {
      target = await resolveCallbackTarget(currentUrl, {
        allowLoopbackHttp,
        lookupImpl,
      });
    } catch (error) {
      if (error instanceof CallbackPolicyError) {
        return { classification: "terminal_failure", error: error.message };
      }
      return {
        classification: "retryable_failure",
        error: error instanceof Error ? error.message : String(error),
      };
    }

    let response;
    try {
      response = await requestImpl({ ...target, headers, body, timeoutMs });
    } catch (error) {
      return {
        classification: "retryable_failure",
        error: error instanceof Error ? error.message : String(error),
      };
    }

    const statusCode = response.statusCode;
    const location = response.headers?.location;
    if (REDIRECT_STATUSES.has(statusCode) && location) {
      if (redirects >= maxRedirects) {
        return {
          classification: "terminal_failure",
          error: "Callback redirect limit exceeded.",
        };
      }
      try {
        currentUrl = new URL(
          Array.isArray(location) ? location[0] : location,
          target.url,
        ).href;
      } catch {
        return {
          classification: "terminal_failure",
          error: "Callback redirect URL is invalid.",
        };
      }
      continue;
    }

    return { classification: classifyStatus(statusCode), statusCode };
  }
}
