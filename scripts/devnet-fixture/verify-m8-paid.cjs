const fs = require("node:fs");
const crypto = require("node:crypto");
const path = require("node:path");
const anchor = require("@anchor-lang/core");
const { Connection, PublicKey } = require("@solana/web3.js");
const {
  NATIVE_MINT,
  getAssociatedTokenAddressSync,
  getAccount,
} = require("@solana/spl-token");

const RPC = "https://api.devnet.solana.com";
const FIXTURE_NAME = "ground-relay-m8-physical-2026-09-27-v1";
const EXPECTED_REWARD = 1_000_000n;
const EXPECTED_PROGRAM_ID = "6v2peeoZVj2AXfczVLqyMUTHYt3XQPqAxCktpTwjUZap";

function statusName(status) {
  return (Object.keys(status)[0] ?? "unknown").toLowerCase();
}

function tokenAmountForIndex(entries, index) {
  const entry = (entries ?? []).find((item) => item.accountIndex === index);
  return entry ? BigInt(entry.uiTokenAmount.amount) : 0n;
}

async function main() {
  const connection = new Connection(RPC, "confirmed");
  const idl = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "../../idl/ground_relay.json"), "utf8"),
  );
  const program = new anchor.Program(idl, { connection });
  if (program.programId.toBase58() !== EXPECTED_PROGRAM_ID) {
    throw new Error(`Unexpected program ID: ${program.programId.toBase58()}`);
  }

  const poster = new PublicKey("6WG3UpKV9vBRh4XR961eZGpPZcHVGdxqpM3Eten5quuZ");
  const taskId = crypto.createHash("sha256").update(FIXTURE_NAME).digest();
  const [taskPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("task"), poster.toBuffer(), taskId],
    program.programId,
  );
  const [vaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), taskPda.toBuffer()],
    program.programId,
  );

  const task = await program.account.taskEscrow.fetch(taskPda);
  const status = statusName(task.status);
  if (status !== "paid") throw new Error(`Expected paid task, got ${status}`);
  if (BigInt(task.rewardAmount.toString()) !== EXPECTED_REWARD) {
    throw new Error(`Unexpected reward amount: ${task.rewardAmount}`);
  }

  const worker = task.worker;
  const workerAta = getAssociatedTokenAddressSync(NATIVE_MINT, worker);
  const workerAccount = await getAccount(connection, workerAta, "confirmed");
  const vaultAccount = await getAccount(connection, vaultPda, "confirmed");
  if (vaultAccount.amount !== 0n) {
    throw new Error(`Expected zero vault amount after payout, got ${vaultAccount.amount}`);
  }

  const signatures = await connection.getSignaturesForAddress(taskPda, { limit: 20 }, "confirmed");
  let payout = null;
  for (const item of signatures) {
    const tx = await connection.getTransaction(item.signature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
    if (!tx?.meta || tx.meta.err) continue;
    const logs = tx.meta.logMessages ?? [];
    if (!logs.some((line) => line.includes("Instruction: ReleasePayment"))) continue;

    const keys = tx.transaction.message.getAccountKeys().staticAccountKeys;
    const workerIndex = keys.findIndex((key) => key.equals(workerAta));
    const vaultIndex = keys.findIndex((key) => key.equals(vaultPda));
    if (workerIndex < 0 || vaultIndex < 0) {
      throw new Error("ReleasePayment transaction is missing expected worker/vault accounts");
    }

    const workerBefore = tokenAmountForIndex(tx.meta.preTokenBalances, workerIndex);
    const workerAfter = tokenAmountForIndex(tx.meta.postTokenBalances, workerIndex);
    const vaultBefore = tokenAmountForIndex(tx.meta.preTokenBalances, vaultIndex);
    const vaultAfter = tokenAmountForIndex(tx.meta.postTokenBalances, vaultIndex);
    const workerDelta = workerAfter - workerBefore;
    const vaultDelta = vaultAfter - vaultBefore;

    if (workerDelta !== EXPECTED_REWARD) {
      throw new Error(`Worker payout delta mismatch: ${workerDelta}`);
    }
    if (vaultDelta !== -EXPECTED_REWARD) {
      throw new Error(`Vault payout delta mismatch: ${vaultDelta}`);
    }
    if (vaultAfter !== 0n) {
      throw new Error(`Vault post-balance is not zero: ${vaultAfter}`);
    }

    payout = {
      signature: item.signature,
      slot: item.slot,
      workerBefore: workerBefore.toString(),
      workerAfter: workerAfter.toString(),
      workerDelta: workerDelta.toString(),
      vaultBefore: vaultBefore.toString(),
      vaultAfter: vaultAfter.toString(),
      vaultDelta: vaultDelta.toString(),
    };
    break;
  }

  if (!payout) throw new Error("Could not locate confirmed ReleasePayment transaction");

  console.log("M8 final paid verification: PASS");
  console.log("M8_PAID_JSON=" + JSON.stringify({
    taskPda: taskPda.toBase58(),
    vaultPda: vaultPda.toBase58(),
    worker: worker.toBase58(),
    workerAta: workerAta.toBase58(),
    mint: task.mint.toBase58(),
    rewardAtomic: task.rewardAmount.toString(),
    status,
    liveWorkerAtaAmount: workerAccount.amount.toString(),
    liveVaultAmount: vaultAccount.amount.toString(),
    payout,
  }));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
