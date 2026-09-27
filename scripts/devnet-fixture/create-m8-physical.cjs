const fs = require("node:fs");
const crypto = require("node:crypto");
const path = require("node:path");
const anchor = require("@anchor-lang/core");
const {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} = require("@solana/web3.js");
const {
  NATIVE_MINT,
  TOKEN_PROGRAM_ID,
  getOrCreateAssociatedTokenAccount,
  getAccount,
  createSyncNativeInstruction,
} = require("@solana/spl-token");

const RPC = "https://api.devnet.solana.com";
const EXPECTED_PROGRAM_ID = "6v2peeoZVj2AXfczVLqyMUTHYt3XQPqAxCktpTwjUZap";
const REWARD_ATOMIC = 1_000_000n;
const FIXTURE_NAME = "ground-relay-m8-physical-2026-09-27-v1";
const GATEWAY_TASK_ID = "m8-physical-2026-09-27-v1";
const CALLBACK_URL = "https://example.com/ground-relay/m8-physical-resume";

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
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  if (!response.ok) {
    throw new Error(`Gateway ${options.method ?? "GET"} ${url} -> ${response.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

async function recoverPostSignature(connection, taskPda) {
  const signatures = await connection.getSignaturesForAddress(taskPda, { limit: 100 }, "confirmed");
  if (signatures.length === 0) throw new Error("Could not recover a post_task signature for existing M8 task");
  return signatures.at(-1).signature;
}

async function main() {
  const keypairPath = process.env.POSTER_KEYPAIR;
  const gatewayBase = process.env.GATEWAY_BASE_URL?.replace(/\/+$/, "");
  if (!keypairPath) throw new Error("POSTER_KEYPAIR is required");
  if (!gatewayBase) throw new Error("GATEWAY_BASE_URL is required");

  const payer = readKeypair(keypairPath);
  const connection = new Connection(RPC, "confirmed");
  const idlPath = path.resolve(__dirname, "../../target/idl/ground_relay.json");
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf8"));
  const program = new anchor.Program(idl, { connection });

  if (program.programId.toBase58() !== EXPECTED_PROGRAM_ID) {
    throw new Error(`IDL program ID mismatch: ${program.programId.toBase58()} != ${EXPECTED_PROGRAM_ID}`);
  }

  const balance = await connection.getBalance(payer.publicKey, "confirmed");
  if (balance < 20_000_000) {
    throw new Error("Poster has less than 0.02 devnet SOL; M8 fixture creation is unsafe");
  }

  const posterToken = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    NATIVE_MINT,
    payer.publicKey,
  );

  let posterWrapped = await getAccount(connection, posterToken.address);
  if (posterWrapped.amount < REWARD_ATOMIC) {
    const topUp = REWARD_ATOMIC - posterWrapped.amount;
    const wrapTx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: posterToken.address,
        lamports: Number(topUp),
      }),
      createSyncNativeInstruction(posterToken.address),
    );
    const wrapSig = await sendAndConfirmTransaction(connection, wrapTx, [payer], {
      commitment: "confirmed",
    });
    console.log("WSOL funding signature:", wrapSig);
  }

  const taskId = crypto.createHash("sha256").update(FIXTURE_NAME).digest();
  const [taskPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("task"), payer.publicKey.toBuffer(), taskId],
    program.programId,
  );
  const [vaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), taskPda.toBuffer()],
    program.programId,
  );

  let postSignature;
  const existing = await connection.getAccountInfo(taskPda, "confirmed");
  if (!existing) {
    const expiresAt = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
    const ix = await program.methods
      .postTask(
        Array.from(taskId),
        new anchor.BN(REWARD_ATOMIC.toString()),
        new anchor.BN(expiresAt),
      )
      .accounts({
        poster: payer.publicKey,
        task: taskPda,
        mint: NATIVE_MINT,
        posterToken: posterToken.address,
        vault: vaultPda,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    postSignature = await sendAndConfirmTransaction(
      connection,
      new Transaction().add(ix),
      [payer],
      { commitment: "confirmed" },
    );
    console.log("post_task signature:", postSignature);
  } else {
    postSignature = await recoverPostSignature(connection, taskPda);
    console.log("M8 task already exists; recovered post signature:", postSignature);
  }

  const task = await program.account.taskEscrow.fetch(taskPda);
  const vault = await getAccount(connection, vaultPda);
  const status = (Object.keys(task.status)[0] ?? "unknown").toLowerCase();
  const expiresAt = Number(task.expiresAt.toString());

  const checks = {
    poster: task.poster.toBase58() === payer.publicKey.toBase58(),
    mint: task.mint.toBase58() === NATIVE_MINT.toBase58(),
    reward: BigInt(task.rewardAmount.toString()) === REWARD_ATOMIC,
    statusOpen: status === "open",
    vaultAuthority: vault.owner.toBase58() === taskPda.toBase58(),
    vaultMint: vault.mint.toBase58() === NATIVE_MINT.toBase58(),
    vaultFunded: vault.amount >= REWARD_ATOMIC,
    notExpired: expiresAt > Math.floor(Date.now() / 1000),
  };
  if (!Object.values(checks).every(Boolean)) {
    throw new Error(`M8 physical escrow verification failed: ${JSON.stringify(checks)}`);
  }

  const createPayload = {
    id: GATEWAY_TASK_ID,
    title: "M8 physical proof — capture a current scene",
    description: "Use Ground Relay on the Android device to capture one clear photo of the current physical scene and complete the hardened devnet flow.",
    poster: payer.publicKey.toBase58(),
    rewardAtomic: REWARD_ATOMIC.toString(),
    rewardMint: NATIVE_MINT.toBase58(),
    expiresAt,
    callbackUrl: CALLBACK_URL,
    criteria: [
      {
        id: "photo",
        description: "Capture one clear current photo using the in-app camera flow.",
        required: true,
      },
    ],
  };

  const gatewayTask = await requestJson(`${gatewayBase}/tasks`, {
    method: "POST",
    headers: { "Idempotency-Key": GATEWAY_TASK_ID },
    body: JSON.stringify(createPayload),
  });

  const boundTask = await requestJson(`${gatewayBase}/tasks/${encodeURIComponent(GATEWAY_TASK_ID)}/chain-binding`, {
    method: "PUT",
    body: JSON.stringify({
      cluster: "devnet",
      programId: EXPECTED_PROGRAM_ID,
      taskPda: taskPda.toBase58(),
      postSignature,
    }),
  });

  const inbox = await requestJson(`${gatewayBase}/tasks`);
  const listed = inbox.tasks?.find((entry) => entry.id === GATEWAY_TASK_ID);
  if (!listed) throw new Error("Fresh M8 task is missing from Gateway inbox");
  if (listed.chain?.taskPda !== taskPda.toBase58()) {
    throw new Error("Gateway inbox task binding does not match the fresh M8 task PDA");
  }

  const output = {
    fixture: FIXTURE_NAME,
    gatewayTaskId: GATEWAY_TASK_ID,
    programId: EXPECTED_PROGRAM_ID,
    poster: payer.publicKey.toBase58(),
    mint: NATIVE_MINT.toBase58(),
    rewardAtomic: REWARD_ATOMIC.toString(),
    taskIdHex: taskId.toString("hex"),
    taskPda: taskPda.toBase58(),
    vaultPda: vaultPda.toBase58(),
    posterToken: posterToken.address.toBase58(),
    postSignature,
    expiresAt,
    status,
    vaultAmount: vault.amount.toString(),
    gatewayStatus: gatewayTask.status,
    boundGatewayStatus: boundTask.status,
  };

  console.log("M8 physical fixture verification: PASS");
  console.log("M8_FIXTURE_JSON=" + JSON.stringify(output));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
