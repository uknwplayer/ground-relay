const fs = require("node:fs");
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
const TASK_PDA = new PublicKey("7knPNeaZHDn7qVzdGy6Qbq3tWnHMnP2TpHULwLKzVtpT");

function readKeypair(filename) {
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(filename, "utf8"))),
  );
}

async function main() {
  const keypairPath = process.env.POSTER_KEYPAIR;
  if (!keypairPath) throw new Error("POSTER_KEYPAIR is required");

  const poster = readKeypair(keypairPath);
  const connection = new Connection(RPC, "confirmed");
  const idl = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "../../idl/ground_relay.json"), "utf8"),
  );
  const program = new anchor.Program(idl, { connection });

  const before = await program.account.taskEscrow.fetch(TASK_PDA);
  const beforeStatus = Object.keys(before.status)[0];

  console.log("Task PDA:", TASK_PDA.toBase58());
  console.log("Poster:", poster.publicKey.toBase58());
  console.log("Status before acceptance:", beforeStatus);

  if (before.poster.toBase58() !== poster.publicKey.toBase58()) {
    throw new Error("Poster key does not match the on-chain task poster");
  }

  if (beforeStatus === "accepted" || beforeStatus === "paid") {
    console.log("Task was already accepted; no transaction is required.");
    console.log("Acceptance verification: PASS");
    return;
  }

  if (beforeStatus !== "delivered") {
    throw new Error(
      `Task must be delivered before acceptance; current status is ${beforeStatus}`,
    );
  }

  const instruction = await program.methods
    .acceptTask()
    .accounts({
      poster: poster.publicKey,
      task: TASK_PDA,
    })
    .instruction();

  const signature = await sendAndConfirmTransaction(
    connection,
    new Transaction().add(instruction),
    [poster],
    { commitment: "confirmed" },
  );

  const after = await program.account.taskEscrow.fetch(TASK_PDA);
  const afterStatus = Object.keys(after.status)[0];

  console.log("accept_task signature:", signature);
  console.log("Status after acceptance:", afterStatus);

  if (afterStatus !== "accepted") {
    throw new Error("Task did not transition to accepted");
  }

  console.log("Acceptance verification: PASS");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
