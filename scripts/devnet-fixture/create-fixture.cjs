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
const CLAIM_RECEIPT =
  "23My4fQYQy3vp6YpkSPRfLFBMqkLuusmZJFN92pGB9mjjATAwKSamXjQVZxT8Giy3Ekii8QLeT8SofRzavKc3BTy";
const REWARD_ATOMIC = 1_000_000n; // 0.001 devnet WSOL
const FIXTURE_NAME = "ground-relay-devnet-escrow-v1";

function readKeypair(filename) {
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(filename, "utf8"))),
  );
}

async function resolvePrototypeWorker(connection) {
  const tx = await connection.getParsedTransaction(CLAIM_RECEIPT, {
    commitment: "confirmed",
    maxSupportedTransactionVersion: 0,
  });
  if (!tx) throw new Error("Prototype claim transaction could not be loaded");

  const signer = tx.transaction.message.accountKeys.find((entry) => entry.signer);
  if (!signer) throw new Error("No signer found in prototype claim transaction");
  return signer.pubkey;
}

async function main() {
  const keypairPath = process.env.POSTER_KEYPAIR;
  if (!keypairPath) throw new Error("POSTER_KEYPAIR is required");

  const payer = readKeypair(keypairPath);
  const connection = new Connection(RPC, "confirmed");

  const idlPath = path.resolve(__dirname, "../../target/idl/ground_relay.json");
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf8"));
  const program = new anchor.Program(idl, { connection });

  if (program.programId.toBase58() !== EXPECTED_PROGRAM_ID) {
    throw new Error(
      `IDL program ID mismatch: ${program.programId.toBase58()} != ${EXPECTED_PROGRAM_ID}`,
    );
  }

  const worker = await resolvePrototypeWorker(connection);
  const balance = await connection.getBalance(payer.publicKey, "confirmed");
  console.log("Poster:", payer.publicKey.toBase58());
  console.log("Worker:", worker.toBase58());
  console.log("Poster SOL balance:", balance / 1_000_000_000);
  console.log("Reward mint: devnet WSOL", NATIVE_MINT.toBase58());
  console.log("Reward atomic:", REWARD_ATOMIC.toString());

  if (balance < 20_000_000) {
    throw new Error("Poster has less than 0.02 devnet SOL; fixture creation is unsafe");
  }

  const posterToken = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    NATIVE_MINT,
    payer.publicKey,
  );
  const workerToken = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    NATIVE_MINT,
    worker,
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
    posterWrapped = await getAccount(connection, posterToken.address);
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

  console.log("Task fixture:", FIXTURE_NAME);
  console.log("Task ID (hex):", taskId.toString("hex"));
  console.log("Task PDA:", taskPda.toBase58());
  console.log("Vault PDA:", vaultPda.toBase58());
  console.log("Poster WSOL ATA:", posterToken.address.toBase58());
  console.log("Worker WSOL ATA:", workerToken.address.toBase58());

  const existing = await connection.getAccountInfo(taskPda, "confirmed");
  let postSignature = null;

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
    console.log("Task PDA already exists; verifying the existing fixture.");
  }

  const task = await program.account.taskEscrow.fetch(taskPda);
  const vault = await getAccount(connection, vaultPda);

  const statusName = Object.keys(task.status)[0] ?? "unknown";
  const checks = {
    poster: task.poster.toBase58() === payer.publicKey.toBase58(),
    mint: task.mint.toBase58() === NATIVE_MINT.toBase58(),
    reward: BigInt(task.rewardAmount.toString()) === REWARD_ATOMIC,
    statusOpen: statusName.toLowerCase() === "open",
    vaultAuthority: vault.owner.toBase58() === taskPda.toBase58(),
    vaultMint: vault.mint.toBase58() === NATIVE_MINT.toBase58(),
    vaultFunded: vault.amount >= REWARD_ATOMIC,
  };

  console.log("Task status:", statusName);
  console.log("Vault amount:", vault.amount.toString());
  console.log("Fixture checks:", JSON.stringify(checks));

  if (!Object.values(checks).every(Boolean)) {
    throw new Error("Funded escrow fixture verification failed");
  }

  console.log("M4 fixture verification: PASS");
  console.log(
    "FIXTURE_JSON=" +
      JSON.stringify({
        fixture: FIXTURE_NAME,
        programId: program.programId.toBase58(),
        poster: payer.publicKey.toBase58(),
        worker: worker.toBase58(),
        mint: NATIVE_MINT.toBase58(),
        rewardAtomic: REWARD_ATOMIC.toString(),
        taskIdHex: taskId.toString("hex"),
        taskPda: taskPda.toBase58(),
        vaultPda: vaultPda.toBase58(),
        posterToken: posterToken.address.toBase58(),
        workerToken: workerToken.address.toBase58(),
        postSignature,
        status: statusName,
        vaultAmount: vault.amount.toString(),
      }),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
