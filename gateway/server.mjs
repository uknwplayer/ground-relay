import { createServer } from "node:http";
import { createHash, randomUUID } from "node:crypto";

export const tasks = new Map();

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
  const match = pathname.match(
    /^\/v1\/tasks\/([^/]+)(?:\/(claim|deliveries|verify|paid))?$/,
  );
  if (!match) return null;
  return { taskId: decodeURIComponent(match[1]), action: match[2] ?? null };
}

function canonicalHash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function publicTask(task) {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    poster: task.poster,
    worker: task.worker,
    status: task.status,
    rewardAtomic: task.rewardAtomic,
    rewardMint: task.rewardMint,
    createdAt: task.createdAt,
    expiresAt: task.expiresAt,
    criteria: task.criteria,
    callbackUrl: task.callbackUrl,
    evidenceHash: task.evidenceHash,
    settlementSignature: task.settlementSignature,
  };
}

export function createRelayServer() {
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");

      if (req.method === "GET" && url.pathname === "/health") {
        return json(res, 200, { ok: true, service: "ground-relay-agent-gateway" });
      }

      if (req.method === "POST" && url.pathname === "/v1/tasks") {
        const body = await readJson(req);
        if (
          !body.title ||
          !body.description ||
          !body.poster ||
          !body.rewardAtomic ||
          !body.rewardMint ||
          !Array.isArray(body.criteria) ||
          body.criteria.length === 0
        ) {
          return json(res, 400, { error: "invalid_task" });
        }

        const id = body.id ?? randomUUID();
        if (tasks.has(id)) {
          return json(res, 409, { error: "task_exists" });
        }

        const task = {
          id,
          title: body.title,
          description: body.description,
          poster: body.poster,
          worker: undefined,
          status: "open",
          rewardAtomic: String(body.rewardAtomic),
          rewardMint: body.rewardMint,
          createdAt: new Date().toISOString(),
          expiresAt: body.expiresAt,
          criteria: body.criteria,
          callbackUrl: body.callbackUrl,
          evidenceHash: undefined,
          settlementSignature: undefined,
          eventHash: canonicalHash({ id, body }),
        };
        tasks.set(id, task);
        return json(res, 201, publicTask(task));
      }

      const route = parseTaskPath(url.pathname);
      if (!route) return json(res, 404, { error: "not_found" });

      const task = tasks.get(route.taskId);
      if (!task) return json(res, 404, { error: "task_not_found" });

      if (req.method === "GET" && route.action === null) {
        return json(res, 200, publicTask(task));
      }

      if (req.method === "POST" && route.action === "claim") {
        const body = await readJson(req);
        if (task.status !== "open") {
          return json(res, 409, { error: "invalid_status", status: task.status });
        }
        if (!body.worker) return json(res, 400, { error: "worker_required" });
        task.worker = body.worker;
        task.status = "claimed";
        task.claimSignature = body.signature;
        return json(res, 200, publicTask(task));
      }

      if (req.method === "POST" && route.action === "deliveries") {
        const body = await readJson(req);
        if (task.status !== "claimed") {
          return json(res, 409, { error: "invalid_status", status: task.status });
        }
        if (!body.worker || body.worker !== task.worker) {
          return json(res, 403, { error: "wrong_worker" });
        }
        if (!/^[a-f0-9]{64}$/.test(body.bundleHash ?? "")) {
          return json(res, 400, { error: "invalid_bundle_hash" });
        }
        task.evidenceHash = body.bundleHash;
        task.deliverySignature = body.signature;
        task.status = "delivered";
        return json(res, 202, publicTask(task));
      }

      if (req.method === "POST" && route.action === "verify") {
        const body = await readJson(req);
        if (task.status !== "delivered") {
          return json(res, 409, { error: "invalid_status", status: task.status });
        }
        if (body.poster !== task.poster) {
          return json(res, 403, { error: "wrong_poster" });
        }
        if (body.accepted !== true) {
          task.status = "claimed";
          return json(res, 200, publicTask(task));
        }
        task.status = "accepted";
        return json(res, 200, publicTask(task));
      }

      if (req.method === "POST" && route.action === "paid") {
        const body = await readJson(req);
        if (task.status !== "accepted") {
          return json(res, 409, { error: "invalid_status", status: task.status });
        }
        if (!body.signature) {
          return json(res, 400, { error: "settlement_signature_required" });
        }
        task.settlementSignature = body.signature;
        task.status = "paid";
        return json(res, 200, {
          task: publicTask(task),
          resume: {
            taskId: task.id,
            status: "paid",
            evidenceHash: task.evidenceHash,
            settlementSignature: task.settlementSignature,
            callbackUrl: task.callbackUrl,
          },
        });
      }

      return json(res, 405, { error: "method_not_allowed" });
    } catch (error) {
      return json(res, 500, {
        error: "internal_error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1])) {
  const port = Number(process.env.PORT ?? 8787);
  createRelayServer().listen(port, "127.0.0.1", () => {
    console.log(`Ground Relay agent gateway listening on http://127.0.0.1:${port}`);
  });
}
