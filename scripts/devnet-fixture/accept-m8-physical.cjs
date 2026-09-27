const fs = require("node:fs");
const crypto = require("node:crypto");
const path = require("node:path");
const anchor = require("@anchor-lang/core");
const {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} = require("@solana/web3.js");

const RPC = "https://api.devnet.solana.com";
const FIXTURE_NAME = "ground-relay-m8-physical-2026-09-27-v1";
const GATEWAY_TASK_ID = "m8-physical-2026-09-27-v1";

function readKeypair(filename) {
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(filename, "utf8"))),
  );
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      accept: "application/json",
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(options.headers ?? {}),
    },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(`Gateway ${options.method ?? "GET"} ${url} -> ${response.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

async function main() {
  const keypairPath = process.env.POSTER_KEYPAIR;
  const gatewayBase = process.env.GATEWAY_BASE_URL?.replace(/\/+$/, "");
  if (!keypairPath) throw new Error("POSTER_KEYPAIR is required");

  const poster = readKeypair(keypairPath);
  const connection = new Connection(RPC, "confirmed");
  const idl = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "../../idl/ground_relay.json"), "utf8"),
  );
  const program = new anchor.Program(idl, { connection });
  const taskId = crypto.createHash("sha256").update(FIXTURE_NAME).digest();
  const [taskPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("task"), poster.publicKey.toBuffer(), taskId],
    program.programId,
  );

  const before = await program.account.taskEscrow.fetch(taskPda);
  const beforeStatus = (Object.keys(before.status)[0] ?? "unknown").toLowerCase();

  console.log("Task PDA:", taskPda.toBase58());
  console.log("Poster:", poster.publicKey.toBase58());
  console.log("Status before acceptance:", beforeStatus);
  console.log("Worker:", before.worker?.toBase58?.() ?? String(before.worker));
  console.log("Evidence hash:", Buffer.from(before.evidenceHash).toString("hex"));

  if (before.poster.toBase58() !== poster.publicKey.toBase58()) {
    throw new Error("Poster key does not match the M8 physical task poster");
  }

  let signature;
  if (beforeStatus === "accepted" || beforeStatus === "paid") {
    console.log("M8 physical task was already accepted; no transaction is required.");
  } else {
    if (beforeStatus !== "delivered") {
      throw new Error(`M8 physical task must be delivered before acceptance; current status is ${beforeStatus}`);
    }

    const instruction = await program.methods
      .acceptTask()
      .accounts({
        poster: poster.publicKey,
        task: taskPda,
      })
      .instruction();

    signature = await sendAndConfirmTransaction(
      connection,
      new Transaction().add(instruction),
      [poster],
      { commitment: "confirmed" },
    );
    console.log("accept_task signature:", signature);
  }

  const after = await program.account.taskEscrow.fetch(taskPda);
  const afterStatus = (Object.keys(after.status)[0] ?? "unknown").toLowerCase();
  if (afterStatus !== "accepted" && afterStatus !== "paid") {
    throw new Error(`M8 physical task did not reach accepted/paid; current status is ${afterStatus}`);
  }

  if (gatewayBase) {
    const synced = await requestJson(`${gatewayBase}/tasks/${encodeURIComponent(GATEWAY_TASK_ID)}/sync`, {
      method: "POST",
      body: "{}",
    });
    console.log("Gateway status after acceptance sync:", synced.status);
  }

  console.log("M8 physical acceptance verification: PASS");
  console.log("M8_ACCEPT_JSON=" + JSON.stringify({
    gatewayTaskId: GATEWAY_TASK_ID,
    taskPda: taskPda.toBase58(),
    status: afterStatus,
    signature: signature ?? null,
    evidenceHash: Buffer.from(after.evidenceHash).toString("hex"),
  }));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
