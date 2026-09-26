const DISCRIMINATOR = new Uint8Array([209, 72, 197, 54, 17, 55, 3, 187]);
const STATUS = ["open", "claimed", "delivered", "accepted", "paid", "cancelled"];
const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function chainMismatch(message) {
  const error = new Error(message);
  error.code = "chain_mismatch";
  return error;
}

function bytesToHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function isZero(bytes) {
  return bytes.every((b) => b === 0);
}

function base58Encode(bytes) {
  let value = 0n;
  for (const byte of bytes) value = value * 256n + BigInt(byte);
  let out = "";
  while (value > 0n) {
    const rem = Number(value % 58n);
    out = BASE58[rem] + out;
    value /= 58n;
  }
  let leading = 0;
  while (leading < bytes.length && bytes[leading] === 0) leading += 1;
  return "1".repeat(leading) + out;
}

export function decodeGroundRelayTaskAccount({ data, owner, expectedProgramId }) {
  if (owner !== expectedProgramId) throw chainMismatch("Ground Relay task account owner does not match configured program.");
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (bytes.length < 187) throw chainMismatch(`Ground Relay task account is too small: ${bytes.length}; expected at least 187 bytes.`);
  for (let i = 0; i < DISCRIMINATOR.length; i += 1) {
    if (bytes[i] !== DISCRIMINATOR[i]) throw chainMismatch("Unexpected Ground Relay task account discriminator.");
  }
  const status = STATUS[bytes[152]];
  if (!status) throw chainMismatch(`Unknown Ground Relay task status index: ${bytes[152]}`);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const workerBytes = bytes.slice(72, 104);
  const evidenceBytes = bytes.slice(153, 185);
  return {
    taskIdHex: bytesToHex(bytes.slice(8, 40)),
    poster: base58Encode(bytes.slice(40, 72)),
    worker: isZero(workerBytes) ? undefined : base58Encode(workerBytes),
    mint: base58Encode(bytes.slice(104, 136)),
    rewardAtomic: view.getBigUint64(136, true).toString(),
    expiresAt: Number(view.getBigInt64(144, true)),
    status,
    evidenceHash: isZero(evidenceBytes) ? undefined : bytesToHex(evidenceBytes),
  };
}

export function createSolanaChainAdapter({ rpcUrl, programId }) {
  return {
    async readTask(taskPda) {
      const { Connection, PublicKey } = await import("@solana/web3.js");
      const connection = new Connection(rpcUrl, "confirmed");
      let publicKey;
      try {
        publicKey = new PublicKey(taskPda);
      } catch {
        throw chainMismatch("Invalid Ground Relay task PDA.");
      }
      const account = await connection.getAccountInfo(publicKey, "confirmed");
      if (!account) throw chainMismatch("Ground Relay task account not found.");
      return {
        taskPda,
        ...decodeGroundRelayTaskAccount({
          data: account.data,
          owner: account.owner.toBase58(),
          expectedProgramId: programId,
        }),
      };
    },
  };
}
