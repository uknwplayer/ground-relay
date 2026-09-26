import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { sendResumeCallback } from "./callbacks.mjs";
import { createSolanaChainAdapter } from "./chain.mjs";
import { createRelayService, GROUND_RELAY_PROGRAM_ID } from "./service.mjs";
import { createJsonStore } from "./store.mjs";

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function parseTaskPath(pathname) {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] !== "v1" || parts[1] !== "tasks" || !parts[2]) return null;
  const action = parts.length > 3 ? parts.slice(3).join("/") : null;
  const allowed = new Set([null, "claim", "deliveries", "verify", "paid", "sync", "chain-binding", "resume/retry"]);
  if (!allowed.has(action)) return null;
  return { taskId: decodeURIComponent(parts[2]), action };
}

const STATUS_BY_CODE = new Map([
  ["task_not_found", 404],
  ["invalid_task", 400],
  ["callback_not_configured", 400],
  ["worker_required", 400],
  ["invalid_bundle_hash", 400],
  ["wrong_worker", 403],
  ["wrong_poster", 403],
  ["task_exists", 409],
  ["idempotency_conflict", 409],
  ["invalid_status", 409],
  ["task_not_bound", 409],
  ["binding_conflict", 409],
  ["chain_authoritative", 409],
  ["chain_mismatch", 409],
  ["settlement_not_confirmed", 409],
  ["settlement_conflict", 409],
  ["resume_not_ready", 409],
  ["callback_retry_exhausted", 409],
  ["chain_unavailable", 503],
]);

function idempotencyHeader(req) {
  const value = req.headers["idempotency-key"];
  return Array.isArray(value) ? value[0] : value;
}

export function createRelayServer({ service }) {
  if (!service) throw new Error("Ground Relay service is required.");
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      if (req.method === "GET" && url.pathname === "/health") {
        return json(res, 200, { ok: true, service: "ground-relay-agent-gateway" });
      }
      if (req.method === "POST" && url.pathname === "/v1/tasks") {
        const body = await readJson(req);
        const task = await service.createTask(body, { idempotencyKey: idempotencyHeader(req) });
        return json(res, 201, task);
      }
      const route = parseTaskPath(url.pathname);
      if (!route) return json(res, 404, { error: "not_found" });
      if (req.method === "GET" && route.action === null) {
        return json(res, 200, await service.getTask(route.taskId));
      }
      if (req.method === "PUT" && route.action === "chain-binding") {
        return json(res, 200, await service.bindTask(route.taskId, await readJson(req)));
      }
      if (req.method === "POST" && route.action === "sync") {
        return json(res, 200, await service.syncTask(route.taskId));
      }
      if (req.method === "POST" && route.action === "paid") {
        return json(res, 200, await service.notifyPaid(route.taskId, await readJson(req)));
      }
      if (req.method === "POST" && route.action === "resume/retry") {
        return json(res, 200, await service.retryResume(route.taskId));
      }
      if (req.method === "POST" && route.action === "claim") {
        return json(res, 200, await service.claimLocal(route.taskId, await readJson(req)));
      }
      if (req.method === "POST" && route.action === "deliveries") {
        return json(res, 202, await service.deliverLocal(route.taskId, await readJson(req)));
      }
      if (req.method === "POST" && route.action === "verify") {
        return json(res, 200, await service.verifyLocal(route.taskId, await readJson(req)));
      }
      return json(res, 405, { error: "method_not_allowed" });
    } catch (error) {
      if (error instanceof SyntaxError) return json(res, 400, { error: "invalid_task" });
      const code = error?.code;
      const status = STATUS_BY_CODE.get(code) ?? 500;
      return json(res, status, {
        error: code ?? "internal_error",
        ...(status === 500 ? { message: error instanceof Error ? error.message : String(error) } : {}),
      });
    }
  });
}

export async function createDefaultRelayServiceFromEnv(env = process.env) {
  const statePath = env.GROUND_RELAY_STATE_PATH ?? fileURLToPath(new URL("./data/state.json", import.meta.url));
  const rpcUrl = env.GROUND_RELAY_RPC_URL ?? "https://api.devnet.solana.com";
  const programId = env.GROUND_RELAY_PROGRAM_ID ?? GROUND_RELAY_PROGRAM_ID;
  const allowLoopbackHttp = env.GROUND_RELAY_ALLOW_LOOPBACK_HTTP === "1";
  const store = createJsonStore({ statePath });
  await store.init();
  const chain = createSolanaChainAdapter({ rpcUrl, programId });
  const service = createRelayService({
    store,
    chain,
    callbackTransport: (input) => sendResumeCallback(input),
    allowLoopbackHttp,
    programId,
  });
  await service.start();
  return service;
}

const isDirect = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect) {
  const service = await createDefaultRelayServiceFromEnv();
  const port = Number(process.env.PORT ?? 8787);
  createRelayServer({ service }).listen(port, "127.0.0.1", () => {
    console.log(`Ground Relay agent gateway listening on http://127.0.0.1:${port}`);
  });
}
