import assert from "node:assert/strict";
import test from "node:test";
import { address, getAddressEncoder } from "@solana/kit";

import {
  derivePayoutExecutionAddresses,
  resolveVerifiedPayoutContext,
} from "../src/solana/payout-context.ts";

const TASK_PDA = "7knPNeaZHDn7qVzdGy6Qbq3tWnHMnP2TpHULwLKzVtpT";
const OTHER_TASK_PDA = "6WG3UpKV9vBRh4XR961eZGpPZcHVGdxqpM3Eten5quuZ";
const VAULT_PDA = "FGaGmGu8cbYRbdsUubmLDDRNnjic5NutnCM4kFL77bZm";
const WORKER = "7XY6t1adc9vmuefiEP25TsoEjxRkFhVxT4yQrtN5zr2C";
const WORKER_TOKEN = "2fm8p8DpCeJvcpvNbCpzURRezQthF2z2yQARLgPgZfu6";
const MINT = "So11111111111111111111111111111111111111112";
const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

function tokenAccountData({ mint, owner, amount }) {
  const data = new Uint8Array(165);
  const encoder = getAddressEncoder();
  data.set(encoder.encode(address(mint)), 0);
  data.set(encoder.encode(address(owner)), 32);
  new DataView(data.buffer).setBigUint64(64, BigInt(amount), true);
  data[108] = 1;
  return Buffer.from(data).toString("base64");
}

test("generic payout derivation reproduces the canonical fixture without hardcoded addresses", async () => {
  const derived = await derivePayoutExecutionAddresses({
    taskPda: TASK_PDA,
    worker: WORKER,
    rewardMint: MINT,
  });

  assert.equal(derived.vaultPda, VAULT_PDA);
  assert.equal(derived.workerTokenAddress, WORKER_TOKEN);

  const other = await derivePayoutExecutionAddresses({
    taskPda: OTHER_TASK_PDA,
    worker: WORKER,
    rewardMint: MINT,
  });
  assert.notEqual(other.vaultPda, VAULT_PDA);
});

test("verified payout context requires canonical live token accounts", async () => {
  const requested = [];
  const rpc = {
    getAccountInfo(accountAddress) {
      const value = accountAddress.toString();
      requested.push(value);
      if (value === VAULT_PDA) {
        return {
          send: async () => ({
            value: {
              owner: TOKEN_PROGRAM,
              data: [
                tokenAccountData({ mint: MINT, owner: TASK_PDA, amount: 1_000_000n }),
                "base64",
              ],
            },
          }),
        };
      }
      if (value === WORKER_TOKEN) {
        return {
          send: async () => ({
            value: {
              owner: TOKEN_PROGRAM,
              data: [
                tokenAccountData({ mint: MINT, owner: WORKER, amount: 0n }),
                "base64",
              ],
            },
          }),
        };
      }
      return { send: async () => ({ value: null }) };
    },
  };

  const context = await resolveVerifiedPayoutContext(rpc, {
    taskPda: TASK_PDA,
    worker: WORKER,
    rewardMint: MINT,
    rewardAtomic: "1000000",
  });

  assert.deepEqual(context, {
    taskPda: TASK_PDA,
    rewardMint: MINT,
    vaultPda: VAULT_PDA,
    workerTokenAddress: WORKER_TOKEN,
  });
  assert.deepEqual(requested, [VAULT_PDA, WORKER_TOKEN]);
});

test("payout context fails closed when the worker ATA is absent or token accounts do not match", async () => {
  const missingAtaRpc = {
    getAccountInfo(accountAddress) {
      const value = accountAddress.toString();
      return {
        send: async () => ({
          value:
            value === VAULT_PDA
              ? {
                  owner: TOKEN_PROGRAM,
                  data: [
                    tokenAccountData({ mint: MINT, owner: TASK_PDA, amount: 1_000_000n }),
                    "base64",
                  ],
                }
              : null,
        }),
      };
    },
  };

  await assert.rejects(
    () =>
      resolveVerifiedPayoutContext(missingAtaRpc, {
        taskPda: TASK_PDA,
        worker: WORKER,
        rewardMint: MINT,
        rewardAtomic: "1000000",
      }),
    /worker associated token account.*does not exist/i,
  );

  const wrongVaultRpc = {
    getAccountInfo(accountAddress) {
      const value = accountAddress.toString();
      return {
        send: async () => ({
          value: {
            owner: TOKEN_PROGRAM,
            data: [
              tokenAccountData({
                mint: MINT,
                owner: WORKER,
                amount: value === VAULT_PDA ? 1_000_000n : 0n,
              }),
              "base64",
            ],
          },
        }),
      };
    },
  };

  await assert.rejects(
    () =>
      resolveVerifiedPayoutContext(wrongVaultRpc, {
        taskPda: TASK_PDA,
        worker: WORKER,
        rewardMint: MINT,
        rewardAtomic: "1000000",
      }),
    /vault authority/i,
  );
});
