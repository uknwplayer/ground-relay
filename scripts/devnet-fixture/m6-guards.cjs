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
  getMint,
  createSyncNativeInstruction,
  createTransferCheckedInstruction,
  createCloseAccountInstruction,
} = require("@solana/spl-token");

const RPC = "https://api.devnet.solana.com";
const EXPECTED_PROGRAM_ID = "6v2peeoZVj2AXfczVLqyMUTHYt3XQPqAxCktpTwjUZap";
const REWARD_ATOMIC = 1_000_000n; // 0.001 WSOL
const RUN_TAG = `${process.env.GITHUB_RUN_ID || Date.now()}-${process.env.GITHUB_RUN_ATTEMPT || "1"}`;

const ERROR_CODES = {
  InvalidStatus: ["InvalidStatus", "6002", "0x1772"],
  TaskExpired: ["TaskExpired", "6003", "0x1773"],
  WrongWorker: ["WrongWorker", "6004", "0x1774"],
  WrongPoster: ["WrongPoster", "6005", "0x1775"],
};

function readKeypair(filename) {
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(filename, "utf8"))),
  );
}

function taskIdFor(name) {
  return crypto.createHash("sha256").update(`${name}:${RUN_TAG}`).digest();
}

function deriveTask(programId, poster, taskId) {
  const [task] = PublicKey.findProgramAddressSync(
    [Buffer.from("task"), poster.toBuffer(), taskId],
    programId,
  );
  const [vault] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), task.toBuffer()],
    programId,
  );
  return { task, vault };
}

function statusName(task) {
  return (Object.keys(task.status)[0] || "unknown").toLowerCase();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function send(connection, instructions, signers) {
  return sendAndConfirmTransaction(
    connection,
    new Transaction().add(...instructions),
    signers,
    { commitment: "confirmed" },
  );
}

async function expectProgramFailure(label, expectedCode, action) {
  let error;
  try {
    await action();
  } catch (caught) {
    error = caught;
  }

  if (!error) {
    throw new Error(`${label} unexpectedly succeeded`);
  }

  const logs = Array.isArray(error.logs) ? error.logs.join("\n") : "";
  const text = `${error.message || String(error)}\n${logs}`;
  const markers = ERROR_CODES[expectedCode] || [expectedCode];
  const matched = markers.some((marker) =>
    text.toLowerCase().includes(marker.toLowerCase()),
  );

  console.log(`${label}: rejected as expected`);
  console.log(`${label} expected code: ${expectedCode}`);
  if (!matched) {
    console.log(`${label} raw failure:`, text.slice(-2500));
    throw new Error(
      `${label} failed, but did not expose the expected ${expectedCode} marker`,
    );
  }
  console.log(`${label}: PASS`);
}

async function ensurePosterWsol(connection, payer, posterToken, amount) {
  let account = await getAccount(connection, posterToken.address);
  if (account.amount >= amount) return account.amount;

  const topUp = amount - account.amount;
  const signature = await send(
    connection,
    [
      SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: posterToken.address,
        lamports: Number(topUp),
      }),
      createSyncNativeInstruction(posterToken.address),
    ],
    [payer],
  );
  console.log("Poster WSOL top-up signature:", signature);
  account = await getAccount(connection, posterToken.address);
  return account.amount;
}

async function buildPostInstruction(program, payer, posterToken, taskId, task, vault, expiresAt) {
  return program.methods
    .postTask(
      Array.from(taskId),
      new anchor.BN(REWARD_ATOMIC.toString()),
      new anchor.BN(expiresAt),
    )
    .accounts({
      poster: payer.publicKey,
      task,
      mint: NATIVE_MINT,
      posterToken: posterToken.address,
      vault,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
}

async function runSettlementGuards({ connection, program, payer, posterToken, decimals }) {
  console.log("=== M6 settlement guards ===");

  await ensurePosterWsol(connection, payer, posterToken, REWARD_ATOMIC);

  const worker = Keypair.generate();
  const intruder = Keypair.generate();
  const workerToken = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    NATIVE_MINT,
    worker.publicKey,
  );

  const taskId = taskIdFor("ground-relay-m6-settlement-guards");
  const { task, vault } = deriveTask(program.programId, payer.publicKey, taskId);
  const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60;

  console.log("Settlement task ID:", taskId.toString("hex"));
  console.log("Settlement task PDA:", task.toBase58());
  console.log("Settlement vault PDA:", vault.toBase58());
  console.log("Ephemeral worker:", worker.publicKey.toBase58());
  console.log("Ephemeral intruder:", intruder.publicKey.toBase58());
  console.log("Worker WSOL ATA:", workerToken.address.toBase58());

  const postIx = await buildPostInstruction(
    program,
    payer,
    posterToken,
    taskId,
    task,
    vault,
    expiresAt,
  );
  console.log("post_task signature:", await send(connection, [postIx], [payer]));

  const claimIx = await program.methods
    .claimTask()
    .accounts({ worker: worker.publicKey, task })
    .instruction();
  console.log(
    "claim_task signature:",
    await send(connection, [claimIx], [payer, worker]),
  );

  const evidenceHash = crypto
    .createHash("sha256")
    .update(`ground-relay-m6-evidence:${RUN_TAG}`)
    .digest();

  const wrongWorkerIx = await program.methods
    .submitEvidence(Array.from(evidenceHash))
    .accounts({ worker: intruder.publicKey, task })
    .instruction();
  await expectProgramFailure("wrong-worker evidence", "WrongWorker", () =>
    send(connection, [wrongWorkerIx], [payer, intruder]),
  );

  const submitIx = await program.methods
    .submitEvidence(Array.from(evidenceHash))
    .accounts({ worker: worker.publicKey, task })
    .instruction();
  console.log(
    "submit_evidence signature:",
    await send(connection, [submitIx], [payer, worker]),
  );

  const prematureReleaseIx = await program.methods
    .releasePayment()
    .accounts({
      worker: worker.publicKey,
      task,
      mint: NATIVE_MINT,
      vault,
      workerToken: workerToken.address,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .instruction();
  await expectProgramFailure("release before acceptance", "InvalidStatus", () =>
    send(connection, [prematureReleaseIx], [payer, worker]),
  );

  const wrongPosterIx = await program.methods
    .acceptTask()
    .accounts({ poster: intruder.publicKey, task })
    .instruction();
  await expectProgramFailure("wrong-poster acceptance", "WrongPoster", () =>
    send(connection, [wrongPosterIx], [payer, intruder]),
  );

  const acceptIx = await program.methods
    .acceptTask()
    .accounts({ poster: payer.publicKey, task })
    .instruction();
  console.log("accept_task signature:", await send(connection, [acceptIx], [payer]));

  const workerBefore = (await getAccount(connection, workerToken.address)).amount;
  const releaseIx = await program.methods
    .releasePayment()
    .accounts({
      worker: worker.publicKey,
      task,
      mint: NATIVE_MINT,
      vault,
      workerToken: workerToken.address,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .instruction();
  const payoutSignature = await send(connection, [releaseIx], [payer, worker]);
  console.log("release_payment signature:", payoutSignature);

  const paidTask = await program.account.taskEscrow.fetch(task);
  const paidVault = await getAccount(connection, vault);
  const workerAfter = (await getAccount(connection, workerToken.address)).amount;

  if (statusName(paidTask) !== "paid") {
    throw new Error(`Settlement fixture status is ${statusName(paidTask)}, expected paid`);
  }
  if (paidVault.amount !== 0n) {
    throw new Error(`Settlement vault amount is ${paidVault.amount}, expected 0`);
  }
  if (workerAfter - workerBefore !== REWARD_ATOMIC) {
    throw new Error(
      `Worker delta is ${workerAfter - workerBefore}, expected ${REWARD_ATOMIC}`,
    );
  }
  console.log("First payout state/balance verification: PASS");

  const duplicateReleaseIx = await program.methods
    .releasePayment()
    .accounts({
      worker: worker.publicKey,
      task,
      mint: NATIVE_MINT,
      vault,
      workerToken: workerToken.address,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .instruction();
  await expectProgramFailure("second payout", "InvalidStatus", () =>
    send(connection, [duplicateReleaseIx], [payer, worker]),
  );

  const workerAfterDuplicate = (await getAccount(connection, workerToken.address)).amount;
  const vaultAfterDuplicate = (await getAccount(connection, vault)).amount;
  const taskAfterDuplicate = await program.account.taskEscrow.fetch(task);
  if (workerAfterDuplicate !== workerAfter) {
    throw new Error("Worker token balance changed during rejected second payout");
  }
  if (vaultAfterDuplicate !== 0n || statusName(taskAfterDuplicate) !== "paid") {
    throw new Error("Rejected second payout mutated paid task/vault state");
  }
  console.log("Double-pay prevention balance/state verification: PASS");

  const claimAgainIx = await program.methods
    .claimTask()
    .accounts({ worker: intruder.publicKey, task })
    .instruction();
  await expectProgramFailure("claim paid task", "InvalidStatus", () =>
    send(connection, [claimAgainIx], [payer, intruder]),
  );

  const returnAndClose = new Transaction().add(
    createTransferCheckedInstruction(
      workerToken.address,
      NATIVE_MINT,
      posterToken.address,
      worker.publicKey,
      workerAfterDuplicate,
      decimals,
      [],
      TOKEN_PROGRAM_ID,
    ),
    createCloseAccountInstruction(
      workerToken.address,
      payer.publicKey,
      worker.publicKey,
      [],
      TOKEN_PROGRAM_ID,
    ),
  );
  console.log(
    "Ephemeral worker cleanup signature:",
    await sendAndConfirmTransaction(connection, returnAndClose, [payer, worker], {
      commitment: "confirmed",
    }),
  );

  console.log("M6 settlement guards: PASS");
  return {
    task: task.toBase58(),
    vault: vault.toBase58(),
    worker: worker.publicKey.toBase58(),
    evidenceHash: evidenceHash.toString("hex"),
    payoutSignature,
  };
}

async function runExpiryAndCancellation({ connection, program, payer, posterToken }) {
  console.log("=== M6 expiry and cancellation/refund ===");

  await ensurePosterWsol(connection, payer, posterToken, REWARD_ATOMIC);
  const tokenBefore = (await getAccount(connection, posterToken.address)).amount;

  const worker = Keypair.generate();
  const taskId = taskIdFor("ground-relay-m6-expiry-cancel");
  const { task, vault } = deriveTask(program.programId, payer.publicKey, taskId);
  const expiresAt = Math.floor(Date.now() / 1000) + 12;

  console.log("Expiry task ID:", taskId.toString("hex"));
  console.log("Expiry task PDA:", task.toBase58());
  console.log("Expiry vault PDA:", vault.toBase58());
  console.log("Expiry worker:", worker.publicKey.toBase58());
  console.log("Poster WSOL baseline:", tokenBefore.toString());

  const postIx = await buildPostInstruction(
    program,
    payer,
    posterToken,
    taskId,
    task,
    vault,
    expiresAt,
  );
  console.log("expiry post_task signature:", await send(connection, [postIx], [payer]));

  const waitMs = Math.max(0, (expiresAt + 2) * 1000 - Date.now());
  console.log(`Waiting ${waitMs} ms for task expiry...`);
  await sleep(waitMs);

  const expiredClaimIx = await program.methods
    .claimTask()
    .accounts({ worker: worker.publicKey, task })
    .instruction();
  await expectProgramFailure("expired claim", "TaskExpired", () =>
    send(connection, [expiredClaimIx], [payer, worker]),
  );

  const cancelIx = await program.methods
    .cancelOpenTask()
    .accounts({
      poster: payer.publicKey,
      task,
      mint: NATIVE_MINT,
      vault,
      posterToken: posterToken.address,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .instruction();
  const cancelSignature = await send(connection, [cancelIx], [payer]);
  console.log("cancel_open_task signature:", cancelSignature);

  const cancelledTask = await program.account.taskEscrow.fetch(task);
  const cancelledVault = await getAccount(connection, vault);
  const tokenAfter = (await getAccount(connection, posterToken.address)).amount;

  if (statusName(cancelledTask) !== "cancelled") {
    throw new Error(
      `Cancellation fixture status is ${statusName(cancelledTask)}, expected cancelled`,
    );
  }
  if (cancelledVault.amount !== 0n) {
    throw new Error(`Cancelled vault amount is ${cancelledVault.amount}, expected 0`);
  }
  if (tokenAfter !== tokenBefore) {
    throw new Error(
      `Poster WSOL refund mismatch: before=${tokenBefore}, after=${tokenAfter}`,
    );
  }
  console.log("Cancellation refund balance/state verification: PASS");

  const secondCancelIx = await program.methods
    .cancelOpenTask()
    .accounts({
      poster: payer.publicKey,
      task,
      mint: NATIVE_MINT,
      vault,
      posterToken: posterToken.address,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .instruction();
  await expectProgramFailure("second cancellation", "InvalidStatus", () =>
    send(connection, [secondCancelIx], [payer]),
  );

  const claimCancelledIx = await program.methods
    .claimTask()
    .accounts({ worker: worker.publicKey, task })
    .instruction();
  await expectProgramFailure("claim cancelled task", "InvalidStatus", () =>
    send(connection, [claimCancelledIx], [payer, worker]),
  );

  console.log("M6 expiry/cancellation guards: PASS");
  return {
    task: task.toBase58(),
    vault: vault.toBase58(),
    cancelSignature,
    posterTokenBefore: tokenBefore.toString(),
    posterTokenAfter: tokenAfter.toString(),
  };
}

async function main() {
  const keypairPath = process.env.POSTER_KEYPAIR;
  if (!keypairPath) throw new Error("POSTER_KEYPAIR is required");

  const payer = readKeypair(keypairPath);
  const connection = new Connection(RPC, "confirmed");
  const idl = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "../../idl/ground_relay.json"), "utf8"),
  );
  const program = new anchor.Program(idl, { connection });

  if (program.programId.toBase58() !== EXPECTED_PROGRAM_ID) {
    throw new Error(
      `IDL program ID mismatch: ${program.programId.toBase58()} != ${EXPECTED_PROGRAM_ID}`,
    );
  }

  const balance = await connection.getBalance(payer.publicKey, "confirmed");
  console.log("Run tag:", RUN_TAG);
  console.log("Program:", program.programId.toBase58());
  console.log("Controlled poster:", payer.publicKey.toBase58());
  console.log("Poster SOL balance:", balance / 1_000_000_000);
  if (balance < 50_000_000) {
    throw new Error("Poster has less than 0.05 devnet SOL; M6 fixture creation is unsafe");
  }

  const posterToken = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    NATIVE_MINT,
    payer.publicKey,
  );
  const mint = await getMint(connection, NATIVE_MINT);
  console.log("Poster WSOL ATA:", posterToken.address.toBase58());
  console.log("WSOL decimals:", mint.decimals);

  const settlement = await runSettlementGuards({
    connection,
    program,
    payer,
    posterToken,
    decimals: mint.decimals,
  });
  const cancellation = await runExpiryAndCancellation({
    connection,
    program,
    payer,
    posterToken,
  });

  console.log("M6 devnet guard suite: PASS");
  console.log(
    "M6_GUARDS_JSON=" +
      JSON.stringify({
        runTag: RUN_TAG,
        programId: program.programId.toBase58(),
        poster: payer.publicKey.toBase58(),
        settlement,
        cancellation,
      }),
  );
}

main().catch((error) => {
  console.error(error);
  if (Array.isArray(error.logs)) {
    console.error(error.logs.join("\n"));
  }
  process.exit(1);
});
