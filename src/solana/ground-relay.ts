import {
  AccountRole,
  address,
  getBase58Decoder,
  getBase64Encoder,
  type Address,
  type Instruction,
} from "@solana/kit";

import type { TaskStatus } from "../protocol/types";

export const GROUND_RELAY_PROGRAM_ADDRESS = address(
  "6v2peeoZVj2AXfczVLqyMUTHYt3XQPqAxCktpTwjUZap",
);

export const GROUND_RELAY_TASK_ADDRESS = address(
  "7knPNeaZHDn7qVzdGy6Qbq3tWnHMnP2TpHULwLKzVtpT",
);

export const GROUND_RELAY_VAULT_ADDRESS = address(
  "FGaGmGu8cbYRbdsUubmLDDRNnjic5NutnCM4kFL77bZm",
);

export const GROUND_RELAY_REWARD_MINT = address(
  "So11111111111111111111111111111111111111112",
);

export const GROUND_RELAY_POSTER_ADDRESS = address(
  "6WG3UpKV9vBRh4XR961eZGpPZcHVGdxqpM3Eten5quuZ",
);

export const GROUND_RELAY_FIXTURE_TASK_ID =
  "e335a4ea1f23a002db02f94c371d311b5b46fa908a7f2f6c9f72e60ea122f662";

const TASK_ACCOUNT_DISCRIMINATOR = new Uint8Array([
  209, 72, 197, 54, 17, 55, 3, 187,
]);
const CLAIM_TASK_DISCRIMINATOR = new Uint8Array([
  49, 222, 219, 238, 155, 68, 221, 136,
]);
const SUBMIT_EVIDENCE_DISCRIMINATOR = new Uint8Array([
  12, 169, 228, 194, 229, 31, 44, 39,
]);

const STATUS_BY_INDEX: readonly TaskStatus[] = [
  "open",
  "claimed",
  "delivered",
  "accepted",
  "paid",
  "cancelled",
];

export interface OnChainRelayTask {
  taskIdHex: string;
  poster: string;
  worker?: string;
  mint: string;
  rewardAtomic: string;
  expiresAt: number;
  status: TaskStatus;
  evidenceHash?: string;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(value: string): Uint8Array {
  if (!/^[a-f0-9]{64}$/i.test(value)) {
    throw new Error("Expected a 32-byte hexadecimal value.");
  }
  const out = new Uint8Array(32);
  for (let index = 0; index < 32; index += 1) {
    out[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return out;
}

function concatBytes(...chunks: Uint8Array[]): Uint8Array {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function assertDiscriminator(data: Uint8Array): void {
  for (let index = 0; index < TASK_ACCOUNT_DISCRIMINATOR.length; index += 1) {
    if (data[index] !== TASK_ACCOUNT_DISCRIMINATOR[index]) {
      throw new Error("Unexpected Ground Relay task account discriminator.");
    }
  }
}

function readU64LE(data: Uint8Array, offset: number): bigint {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return view.getBigUint64(offset, true);
}

function readI64LE(data: Uint8Array, offset: number): bigint {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return view.getBigInt64(offset, true);
}

function pubkeyToString(bytes: Uint8Array): string {
  return getBase58Decoder().decode(bytes);
}

export function getClaimTaskInstruction(worker: string): Instruction {
  return {
    programAddress: GROUND_RELAY_PROGRAM_ADDRESS,
    accounts: [
      {
        address: address(worker),
        role: AccountRole.WRITABLE_SIGNER,
      },
      {
        address: GROUND_RELAY_TASK_ADDRESS,
        role: AccountRole.WRITABLE,
      },
    ],
    data: CLAIM_TASK_DISCRIMINATOR,
  };
}

export function getSubmitEvidenceInstruction(
  worker: string,
  evidenceHash: string,
): Instruction {
  return {
    programAddress: GROUND_RELAY_PROGRAM_ADDRESS,
    accounts: [
      {
        address: address(worker),
        role: AccountRole.READONLY_SIGNER,
      },
      {
        address: GROUND_RELAY_TASK_ADDRESS,
        role: AccountRole.WRITABLE,
      },
    ],
    data: concatBytes(
      SUBMIT_EVIDENCE_DISCRIMINATOR,
      hexToBytes(evidenceHash),
    ),
  };
}

export async function fetchGroundRelayTask(
  rpc: {
    getAccountInfo: (
      accountAddress: Address,
      config: { encoding: "base64"; commitment: "confirmed" },
    ) => { send: () => Promise<unknown> };
  },
): Promise<OnChainRelayTask> {
  const response = (await rpc
    .getAccountInfo(GROUND_RELAY_TASK_ADDRESS, {
      encoding: "base64",
      commitment: "confirmed",
    })
    .send()) as {
    value: null | {
      data: readonly [string, string];
    };
  };

  if (!response.value) {
    throw new Error("Ground Relay devnet task account was not found.");
  }

  const encoded = response.value.data[0];
  const data = new Uint8Array(getBase64Encoder().encode(encoded));

  if (data.length < 187) {
    throw new Error(`Ground Relay task account is too small: ${data.length} bytes.`);
  }

  assertDiscriminator(data);

  const taskId = data.slice(8, 40);
  const poster = data.slice(40, 72);
  const worker = data.slice(72, 104);
  const mint = data.slice(104, 136);
  const rewardAmount = readU64LE(data, 136);
  const expiresAt = readI64LE(data, 144);
  const statusIndex = data[152];
  const evidenceHashBytes = data.slice(153, 185);

  const status = statusIndex === undefined ? undefined : STATUS_BY_INDEX[statusIndex];
  if (!status) {
    throw new Error(`Unknown Ground Relay task status index: ${statusIndex}`);
  }

  const workerString = pubkeyToString(worker);
  const evidenceHash = bytesToHex(evidenceHashBytes);

  return {
    taskIdHex: bytesToHex(taskId),
    poster: pubkeyToString(poster),
    worker:
      workerString === "11111111111111111111111111111111"
        ? undefined
        : workerString,
    mint: pubkeyToString(mint),
    rewardAtomic: rewardAmount.toString(),
    expiresAt: Number(expiresAt),
    status,
    evidenceHash: /^0{64}$/.test(evidenceHash) ? undefined : evidenceHash,
  };
}
