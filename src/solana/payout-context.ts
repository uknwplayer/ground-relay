import {
  address,
  getAddressDecoder,
  getAddressEncoder,
  getBase64Encoder,
  getProgramDerivedAddress,
  getUtf8Encoder,
  type Address,
} from "@solana/kit";

import {
  GROUND_RELAY_PROGRAM_ADDRESS,
  SPL_TOKEN_PROGRAM_ADDRESS,
  type PayoutExecutionContext,
} from "./ground-relay";

const ASSOCIATED_TOKEN_PROGRAM_ADDRESS = address(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
);

export interface PayoutDerivationInput {
  taskPda: string;
  worker: string;
  rewardMint: string;
}

export interface VerifiedPayoutInput extends PayoutDerivationInput {
  rewardAtomic: string;
}

interface RpcAccountInfo {
  owner: string | Address;
  data: readonly [string, string];
}

interface PayoutRpc {
  getAccountInfo: (
    accountAddress: Address,
    config: { encoding: "base64"; commitment: "confirmed" },
  ) => {
    send: () => Promise<{ value: RpcAccountInfo | null }>;
  };
}

interface DecodedTokenAccount {
  mint: string;
  authority: string;
  amount: bigint;
}

export async function derivePayoutExecutionAddresses(
  input: PayoutDerivationInput,
): Promise<Pick<PayoutExecutionContext, "vaultPda" | "workerTokenAddress">> {
  const addressEncoder = getAddressEncoder();
  const taskPda = address(input.taskPda);
  const worker = address(input.worker);
  const rewardMint = address(input.rewardMint);

  const [vaultPda] = await getProgramDerivedAddress({
    programAddress: GROUND_RELAY_PROGRAM_ADDRESS,
    seeds: [getUtf8Encoder().encode("vault"), addressEncoder.encode(taskPda)],
  });

  const [workerTokenAddress] = await getProgramDerivedAddress({
    programAddress: ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
    seeds: [
      addressEncoder.encode(worker),
      addressEncoder.encode(SPL_TOKEN_PROGRAM_ADDRESS),
      addressEncoder.encode(rewardMint),
    ],
  });

  return {
    vaultPda: vaultPda.toString(),
    workerTokenAddress: workerTokenAddress.toString(),
  };
}

function decodeClassicTokenAccount(
  account: RpcAccountInfo,
  label: string,
): DecodedTokenAccount {
  if (String(account.owner) !== SPL_TOKEN_PROGRAM_ADDRESS.toString()) {
    throw new Error(`${label} is not owned by the classic SPL Token program.`);
  }
  if (account.data[1] !== "base64") {
    throw new Error(`${label} account data is not base64 encoded.`);
  }

  const data = new Uint8Array(getBase64Encoder().encode(account.data[0]));
  if (data.length < 165) {
    throw new Error(`${label} token account data is too short.`);
  }

  const addressDecoder = getAddressDecoder();
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  return {
    mint: String(addressDecoder.decode(data.slice(0, 32))),
    authority: String(addressDecoder.decode(data.slice(32, 64))),
    amount: view.getBigUint64(64, true),
  };
}

async function readTokenAccount(
  rpc: PayoutRpc,
  accountAddress: string,
  label: string,
): Promise<DecodedTokenAccount> {
  const response = await rpc
    .getAccountInfo(address(accountAddress), {
      encoding: "base64",
      commitment: "confirmed",
    })
    .send();

  if (!response.value) {
    throw new Error(`${label} does not exist.`);
  }

  return decodeClassicTokenAccount(response.value, label);
}

export async function resolveVerifiedPayoutContext(
  rpc: PayoutRpc,
  input: VerifiedPayoutInput,
): Promise<PayoutExecutionContext> {
  const rewardAtomic = BigInt(input.rewardAtomic);
  if (rewardAtomic <= 0n) {
    throw new Error("Payout reward amount must be greater than zero.");
  }

  const derived = await derivePayoutExecutionAddresses(input);
  const vault = await readTokenAccount(rpc, derived.vaultPda, "Payout vault");

  if (vault.mint !== input.rewardMint) {
    throw new Error("Payout vault mint does not match the selected task reward mint.");
  }
  if (vault.authority !== input.taskPda) {
    throw new Error("Payout vault authority does not match the selected task PDA.");
  }
  if (vault.amount < rewardAtomic) {
    throw new Error("Payout vault is underfunded for the selected task reward.");
  }

  const workerToken = await readTokenAccount(
    rpc,
    derived.workerTokenAddress,
    "Worker associated token account",
  );

  if (workerToken.mint !== input.rewardMint) {
    throw new Error("Worker associated token account mint does not match the selected task reward mint.");
  }
  if (workerToken.authority !== input.worker) {
    throw new Error("Worker associated token account authority does not match the assigned worker.");
  }

  return {
    taskPda: input.taskPda,
    rewardMint: input.rewardMint,
    vaultPda: derived.vaultPda,
    workerTokenAddress: derived.workerTokenAddress,
  };
}
