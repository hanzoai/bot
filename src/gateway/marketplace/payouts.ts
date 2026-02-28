/**
 * Marketplace payout processing — automated seller payouts.
 *
 * Hybrid settlement model:
 *   USD:      Hanzo Commerce affiliate payout system
 *   $AI token: On-chain ERC-20 transfer on Hanzo chain (36963) with 10% bonus,
 *              plus Commerce ledger recording for audit trail
 *
 * Payout schedule:
 *   - Minimum threshold: configurable (default $10)
 *   - Frequency: weekly (triggered by cron or manual via marketplace.process-payouts)
 *   - Records are pulled from in-memory transaction log
 */

import { createHmac } from "node:crypto";
import type { MarketplaceConfig, MarketplaceChainConfig } from "../../config/types.gateway.js";

export type PayoutRequest = {
  sellerUserId: string;
  sellerNodeId: string;
  amountCents: number;
  preference: "usd" | "ai_token";
  periodStart: number;
  periodEnd: number;
  /** Seller's on-chain wallet address (hex) for $AI token payouts. */
  walletAddress?: string;
};

export type PayoutResult = {
  sellerUserId: string;
  amountCents: number;
  bonusCents: number;
  totalCents: number;
  preference: "usd" | "ai_token";
  status: "paid" | "pending" | "below_minimum" | "failed";
  error?: string;
  transactionId?: string;
  /** On-chain transaction hash (for $AI token payouts). */
  txHash?: string;
};

/**
 * Process a batch of payout requests.
 *
 * For each seller:
 * 1. Verify accumulated earnings meet minimum threshold
 * 2. For USD: POST to Hanzo Commerce affiliate payout endpoint
 * 3. For $AI: On-chain ERC-20 transfer + Commerce ledger recording
 * 4. Record payout result
 */
export async function processPayouts(
  requests: PayoutRequest[],
  config: MarketplaceConfig,
): Promise<PayoutResult[]> {
  const minPayoutCents = config.minPayoutCents ?? 1000; // $10 default
  const aiTokenBonusPct = config.aiTokenBonusPct ?? 10;
  const results: PayoutResult[] = [];

  for (const req of requests) {
    if (req.amountCents < minPayoutCents) {
      results.push({
        sellerUserId: req.sellerUserId,
        amountCents: req.amountCents,
        bonusCents: 0,
        totalCents: req.amountCents,
        preference: req.preference,
        status: "below_minimum",
      });
      continue;
    }

    if (req.preference === "ai_token") {
      const result = await processAiTokenPayout(req, aiTokenBonusPct, config.chain);
      results.push(result);
    } else {
      const result = await processUsdPayout(req);
      results.push(result);
    }
  }

  return results;
}

function getCommerceHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (process.env.COMMERCE_SERVICE_TOKEN) {
    headers.Authorization = `Bearer ${process.env.COMMERCE_SERVICE_TOKEN}`;
  }
  return headers;
}

function getCommerceBaseUrl(): string {
  return (process.env.COMMERCE_API_URL ?? "http://commerce.hanzo.svc.cluster.local:8001").replace(
    /\/+$/,
    "",
  );
}

async function processUsdPayout(req: PayoutRequest): Promise<PayoutResult> {
  const baseUrl = getCommerceBaseUrl();
  const headers = getCommerceHeaders();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetch(`${baseUrl}/api/v1/affiliates/payouts`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        userId: req.sellerUserId,
        amountCents: req.amountCents,
        currency: "usd",
        source: "marketplace",
        periodStart: new Date(req.periodStart).toISOString(),
        periodEnd: new Date(req.periodEnd).toISOString(),
        nodeId: req.sellerNodeId,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      return {
        sellerUserId: req.sellerUserId,
        amountCents: req.amountCents,
        bonusCents: 0,
        totalCents: req.amountCents,
        preference: "usd",
        status: "failed",
        error: `Commerce API ${response.status}: ${errText.substring(0, 200)}`,
      };
    }

    const data = (await response.json()) as { transactionId?: string };
    return {
      sellerUserId: req.sellerUserId,
      amountCents: req.amountCents,
      bonusCents: 0,
      totalCents: req.amountCents,
      preference: "usd",
      status: "paid",
      transactionId: data.transactionId,
    };
  } catch (err) {
    return {
      sellerUserId: req.sellerUserId,
      amountCents: req.amountCents,
      bonusCents: 0,
      totalCents: req.amountCents,
      preference: "usd",
      status: "failed",
      error: `payout request failed: ${String(err)}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Process an $AI token payout:
 * 1. Send on-chain ERC-20 transfer via JSON-RPC if chain config is available
 * 2. Record in Commerce ledger for audit trail
 */
async function processAiTokenPayout(
  req: PayoutRequest,
  bonusPct: number,
  chainConfig?: MarketplaceChainConfig,
): Promise<PayoutResult> {
  const bonusCents = Math.round(req.amountCents * (bonusPct / 100));
  const totalCents = req.amountCents + bonusCents;

  // Step 1: On-chain ERC-20 transfer (if chain config + wallet address available).
  let txHash: string | undefined;
  if (chainConfig?.rpcUrl && chainConfig?.tokenContract && req.walletAddress) {
    try {
      txHash = await sendOnChainTokenTransfer(chainConfig, req.walletAddress, totalCents);
    } catch (err) {
      return {
        sellerUserId: req.sellerUserId,
        amountCents: req.amountCents,
        bonusCents,
        totalCents,
        preference: "ai_token",
        status: "failed",
        error: `on-chain transfer failed: ${String(err)}`,
      };
    }
  }

  // Step 2: Record in Commerce ledger for audit trail.
  const baseUrl = getCommerceBaseUrl();
  const headers = getCommerceHeaders();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetch(`${baseUrl}/api/v1/tokens/distribute`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        userId: req.sellerUserId,
        amountCents: totalCents,
        currency: "ai_token",
        source: "marketplace",
        baseCents: req.amountCents,
        bonusCents,
        bonusPct,
        periodStart: new Date(req.periodStart).toISOString(),
        periodEnd: new Date(req.periodEnd).toISOString(),
        nodeId: req.sellerNodeId,
        txHash,
        chainId: chainConfig?.chainId ?? 36963,
        walletAddress: req.walletAddress,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      return {
        sellerUserId: req.sellerUserId,
        amountCents: req.amountCents,
        bonusCents,
        totalCents,
        preference: "ai_token",
        status: txHash ? "paid" : "failed",
        error: txHash
          ? undefined
          : `Commerce ledger ${response.status}: ${errText.substring(0, 200)}`,
        txHash,
      };
    }

    const data = (await response.json()) as { transactionId?: string };
    return {
      sellerUserId: req.sellerUserId,
      amountCents: req.amountCents,
      bonusCents,
      totalCents,
      preference: "ai_token",
      status: "paid",
      transactionId: data.transactionId,
      txHash,
    };
  } catch (err) {
    return {
      sellerUserId: req.sellerUserId,
      amountCents: req.amountCents,
      bonusCents,
      totalCents,
      preference: "ai_token",
      status: txHash ? "paid" : "failed",
      error: txHash ? undefined : `token payout request failed: ${String(err)}`,
      txHash,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Send an ERC-20 token transfer via signed raw transaction (eth_sendRawTransaction).
 *
 * Signs the transaction locally using the treasury private key via secp256k1,
 * then submits the RLP-encoded signed transaction to the RPC endpoint.
 * This does NOT require an unlocked wallet on the node.
 *
 * Amount is in cents (USD equivalent) -- converted to token units using
 * 18 decimal precision (1 $AI = $0.01 -> 100 cents = 1 token = 1e18 wei).
 */
async function sendOnChainTokenTransfer(
  chainConfig: MarketplaceChainConfig,
  toAddress: string,
  amountCents: number,
): Promise<string> {
  const treasuryKeyEnv = chainConfig.treasuryKeyEnv ?? "MARKETPLACE_TREASURY_KEY";
  const treasuryKey = process.env[treasuryKeyEnv];
  if (!treasuryKey) {
    throw new Error(`treasury key env ${treasuryKeyEnv} not set`);
  }

  const rpcUrl = chainConfig.rpcUrl;
  if (!rpcUrl) {
    throw new Error("chain rpcUrl not configured");
  }

  const treasuryAddress = chainConfig.treasuryAddress;
  if (!treasuryAddress) {
    throw new Error("treasury address not configured");
  }

  // Convert cents to token amount: 1 $AI = $0.01 = 1 cent
  // So amountCents tokens with 18 decimals = amountCents * 1e18
  const tokenAmount = BigInt(amountCents) * BigInt(10) ** BigInt(18);

  // ERC-20 transfer(address,uint256) function selector: 0xa9059cbb
  const paddedTo = toAddress.replace(/^0x/, "").padStart(64, "0");
  const paddedAmount = tokenAmount.toString(16).padStart(64, "0");
  const callData = `0xa9059cbb${paddedTo}${paddedAmount}`;

  // Get nonce and gas price from chain.
  const [nonceHex, gasPriceHex] = await Promise.all([
    jsonRpcCall(rpcUrl, "eth_getTransactionCount", [treasuryAddress, "pending"]) as Promise<string>,
    jsonRpcCall(rpcUrl, "eth_gasPrice", []) as Promise<string>,
  ]);

  const chainId = chainConfig.chainId ?? 36963;
  const nonce = parseInt(nonceHex, 16);
  const gasLimit = 90_000; // Sufficient for ERC-20 transfer
  const gasPrice = BigInt(gasPriceHex);
  const toContract = chainConfig.tokenContract!;

  // Build, sign, and submit the raw transaction.
  const rawTx = signTransaction(
    {
      nonce,
      gasPrice,
      gasLimit,
      to: toContract,
      value: BigInt(0),
      data: callData,
      chainId,
    },
    treasuryKey,
  );

  const txHash = await jsonRpcCall(rpcUrl, "eth_sendRawTransaction", [`0x${rawTx}`]);
  return txHash as string;
}

// ---------------------------------------------------------------------------
// RLP encoding (Recursive Length Prefix) for Ethereum transaction serialization.
// ---------------------------------------------------------------------------

type RlpInput = Uint8Array | string | bigint | number | RlpInput[];

/** Encode a value using RLP. */
function rlpEncode(input: RlpInput): Uint8Array {
  if (input instanceof Uint8Array) {
    return rlpEncodeBytes(input);
  }
  if (typeof input === "string") {
    return rlpEncodeBytes(hexToBytes(input));
  }
  if (typeof input === "bigint" || typeof input === "number") {
    const n = BigInt(input);
    if (n === BigInt(0)) {
      return rlpEncodeBytes(new Uint8Array(0));
    }
    return rlpEncodeBytes(bigintToBytes(n));
  }
  if (Array.isArray(input)) {
    const encoded = input.map(rlpEncode);
    const totalLength = encoded.reduce((sum, e) => sum + e.length, 0);
    const prefix = rlpLengthPrefix(totalLength, 0xc0);
    const result = new Uint8Array(prefix.length + totalLength);
    result.set(prefix, 0);
    let offset = prefix.length;
    for (const e of encoded) {
      result.set(e, offset);
      offset += e.length;
    }
    return result;
  }
  throw new Error("unsupported RLP input type");
}

function rlpEncodeBytes(bytes: Uint8Array): Uint8Array {
  if (bytes.length === 1 && bytes[0] < 0x80) {
    return bytes;
  }
  const prefix = rlpLengthPrefix(bytes.length, 0x80);
  const result = new Uint8Array(prefix.length + bytes.length);
  result.set(prefix, 0);
  result.set(bytes, prefix.length);
  return result;
}

function rlpLengthPrefix(length: number, offset: number): Uint8Array {
  if (length < 56) {
    return new Uint8Array([offset + length]);
  }
  const lenBytes = bigintToBytes(BigInt(length));
  const result = new Uint8Array(1 + lenBytes.length);
  result[0] = offset + 55 + lenBytes.length;
  result.set(lenBytes, 1);
  return result;
}

function bigintToBytes(n: bigint): Uint8Array {
  if (n === BigInt(0)) {
    return new Uint8Array(0);
  }
  let hex = n.toString(16);
  if (hex.length % 2 !== 0) {
    hex = `0${hex}`;
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function hexToBytes(hex: string): Uint8Array {
  const h = hex.replace(/^0x/, "");
  if (h.length === 0) {
    return new Uint8Array(0);
  }
  const padded = h.length % 2 === 0 ? h : `0${h}`;
  const bytes = new Uint8Array(padded.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(padded.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (const b of bytes) {
    hex += b.toString(16).padStart(2, "0");
  }
  return hex;
}

/** Keccak-256 hash (Ethereum uses keccak, not NIST SHA-3). */
function keccak256(data: Uint8Array): Uint8Array {
  // Node.js 22+ exposes keccak256 as a hash algorithm in the crypto module.
  // The algorithm name is "sha3-256" in OpenSSL, but Ethereum uses the original
  // Keccak which differs from NIST SHA-3. Node.js crypto provides the NIST version.
  // For Ethereum compatibility we use the createHash('sha3-256') which in OpenSSL 3
  // actually provides Keccak-256 when accessed as 'sha3-256'.
  // However, the safest approach for Ethereum: use the raw Keccak sponge.
  // Since we don't have a keccak library, we rely on OpenSSL's sha3-256 which
  // in practice matches keccak256 for the message lengths we use in EIP-155 signing.
  //
  // Note: OpenSSL 3's "sha3-256" is NIST SHA-3 (FIPS 202), NOT Keccak-256.
  // They differ in the padding byte (0x06 vs 0x01). For production Ethereum signing,
  // this MUST use the proper Keccak-256. We implement the Keccak-f[1600] sponge.
  return keccakF1600(data);
}

/**
 * Keccak-256 (pre-NIST, Ethereum standard) implemented via the Keccak-f[1600]
 * permutation sponge. Rate = 1088 bits (136 bytes), capacity = 512 bits.
 * Domain separation byte = 0x01 (original Keccak, NOT NIST SHA-3's 0x06).
 */
function keccakF1600(input: Uint8Array): Uint8Array {
  const RATE = 136;
  const OUTPUT_LEN = 32;

  // State: 5x5 matrix of 64-bit lanes = 25 lanes = 200 bytes.
  const state = new BigUint64Array(25);

  // Absorb phase: XOR input blocks into state, permute after each block.
  let offset = 0;
  const padded = keccakPad(input, RATE);
  while (offset < padded.length) {
    const block = padded.subarray(offset, offset + RATE);
    const blockView = new DataView(block.buffer, block.byteOffset, block.byteLength);
    for (let i = 0; i < RATE / 8; i++) {
      state[i] ^= blockView.getBigUint64(i * 8, true);
    }
    keccakPermute(state);
    offset += RATE;
  }

  // Squeeze phase: extract output bytes from state.
  const output = new Uint8Array(OUTPUT_LEN);
  const outView = new DataView(output.buffer);
  for (let i = 0; i < OUTPUT_LEN / 8; i++) {
    outView.setBigUint64(i * 8, state[i], true);
  }
  return output;
}

/** Keccak multi-rate padding (pad10*1): append 0x01, zeros, then set final bit. */
function keccakPad(input: Uint8Array, rate: number): Uint8Array {
  const blockCount = Math.floor(input.length / rate) + 1;
  const padded = new Uint8Array(blockCount * rate);
  padded.set(input);
  // Domain separation byte for original Keccak (NOT NIST SHA-3).
  padded[input.length] = 0x01;
  padded[padded.length - 1] |= 0x80;
  return padded;
}

/** Keccak-f[1600] permutation: 24 rounds. */
function keccakPermute(state: BigUint64Array): void {
  /* eslint-disable no-bitwise */
  const RC: bigint[] = [
    0x0000000000000001n,
    0x0000000000008082n,
    0x800000000000808an,
    0x8000000080008000n,
    0x000000000000808bn,
    0x0000000080000001n,
    0x8000000080008081n,
    0x8000000000008009n,
    0x000000000000008an,
    0x0000000000000088n,
    0x0000000080008009n,
    0x000000008000000an,
    0x000000008000808bn,
    0x800000000000008bn,
    0x8000000000008089n,
    0x8000000000008003n,
    0x8000000000008002n,
    0x8000000000000080n,
    0x000000000000800an,
    0x800000008000000an,
    0x8000000080008081n,
    0x8000000000008080n,
    0x0000000080000001n,
    0x8000000080008008n,
  ];

  const ROT_OFFSETS = [
    0, 1, 62, 28, 27, 36, 44, 6, 55, 20, 3, 10, 43, 25, 39, 41, 45, 15, 21, 8, 18, 2, 61, 56, 14,
  ];

  const PI_INDICES = [
    0, 10, 20, 5, 15, 16, 1, 11, 21, 6, 7, 17, 2, 12, 22, 23, 8, 18, 3, 13, 14, 24, 9, 19, 4,
  ];

  const MASK64 = 0xffffffffffffffffn;

  const rot64 = (x: bigint, n: number): bigint => {
    const s = n % 64;
    if (s === 0) return x;
    return ((x << BigInt(s)) | (x >> BigInt(64 - s))) & MASK64;
  };

  const C = new BigUint64Array(5);
  const D = new BigUint64Array(5);
  const B = new BigUint64Array(25);

  for (let round = 0; round < 24; round++) {
    // Theta step.
    for (let x = 0; x < 5; x++) {
      C[x] = state[x] ^ state[x + 5] ^ state[x + 10] ^ state[x + 15] ^ state[x + 20];
    }
    for (let x = 0; x < 5; x++) {
      D[x] = C[(x + 4) % 5] ^ rot64(C[(x + 1) % 5], 1);
    }
    for (let i = 0; i < 25; i++) {
      state[i] = (state[i] ^ D[i % 5]) & MASK64;
    }

    // Rho + Pi steps.
    for (let i = 0; i < 25; i++) {
      B[PI_INDICES[i]] = rot64(state[i], ROT_OFFSETS[i]);
    }

    // Chi step.
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        state[y * 5 + x] =
          (B[y * 5 + x] ^ (~B[y * 5 + ((x + 1) % 5)] & B[y * 5 + ((x + 2) % 5)])) & MASK64;
      }
    }

    // Iota step.
    state[0] = (state[0] ^ RC[round]) & MASK64;
  }
  /* eslint-enable no-bitwise */
}

// ---------------------------------------------------------------------------
// secp256k1 ECDSA signing for Ethereum transaction signatures (EIP-155).
// ---------------------------------------------------------------------------

/** secp256k1 curve parameters. */
const SECP256K1 = {
  p: 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn,
  n: 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n,
  Gx: 0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n,
  Gy: 0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8n,
  a: 0n,
};

/** Modular inverse using extended Euclidean algorithm. */
function modInverse(a: bigint, m: bigint): bigint {
  let [old_r, r] = [a % m, m];
  let [old_s, s] = [1n, 0n];
  while (r !== 0n) {
    const q = old_r / r;
    [old_r, r] = [r, old_r - q * r];
    [old_s, s] = [s, old_s - q * s];
  }
  return ((old_s % m) + m) % m;
}

/** Point addition on secp256k1. */
function pointAdd(x1: bigint, y1: bigint, x2: bigint, y2: bigint, p: bigint): [bigint, bigint] {
  if (x1 === 0n && y1 === 0n) return [x2, y2];
  if (x2 === 0n && y2 === 0n) return [x1, y1];
  if (x1 === x2 && y1 === y2) return pointDouble(x1, y1, p);
  if (x1 === x2) return [0n, 0n]; // Point at infinity

  const slope = ((y2 - y1) * modInverse((((x2 - x1) % p) + p) % p, p)) % p;
  const sPos = (slope + p) % p;
  let rx = (sPos * sPos - x1 - x2) % p;
  rx = (rx + p) % p;
  let ry = (sPos * (x1 - rx) - y1) % p;
  ry = (ry + p) % p;
  return [rx, ry];
}

/** Point doubling on secp256k1. */
function pointDouble(x: bigint, y: bigint, p: bigint): [bigint, bigint] {
  if (y === 0n) return [0n, 0n];
  const slope = ((3n * x * x + SECP256K1.a) * modInverse((2n * y) % p, p)) % p;
  const sPos = (slope + p) % p;
  let rx = (sPos * sPos - 2n * x) % p;
  rx = (rx + p) % p;
  let ry = (sPos * (x - rx) - y) % p;
  ry = (ry + p) % p;
  return [rx, ry];
}

/** Scalar multiplication using double-and-add. */
function pointMul(k: bigint, x: bigint, y: bigint, p: bigint): [bigint, bigint] {
  let [rx, ry] = [0n, 0n];
  let [qx, qy] = [x, y];
  let scalar = k;
  while (scalar > 0n) {
    if (scalar & 1n) {
      [rx, ry] = pointAdd(rx, ry, qx, qy, p);
    }
    [qx, qy] = pointDouble(qx, qy, p);
    scalar >>= 1n;
  }
  return [rx, ry];
}

/**
 * Sign a 32-byte message hash with a secp256k1 private key.
 * Returns {r, s, v} where v is the recovery ID (0 or 1).
 */
function ecdsaSign(
  msgHash: Uint8Array,
  privateKey: Uint8Array,
): { r: bigint; s: bigint; v: number } {
  const z = BigInt(`0x${bytesToHex(msgHash)}`);
  const d = BigInt(`0x${bytesToHex(privateKey)}`);
  const { n, Gx, Gy, p } = SECP256K1;
  const halfN = n >> 1n;

  // Deterministic k via RFC 6979 (HMAC-DRBG with SHA-256).
  const k = generateDeterministicK(msgHash, privateKey, n);

  const [rx, ry] = pointMul(k, Gx, Gy, p);
  const r = rx % n;
  if (r === 0n) {
    throw new Error("invalid signature: r = 0");
  }

  let s = (modInverse(k, n) * (z + r * d)) % n;
  let recoveryId = ry % 2n === 0n ? 0 : 1;

  // Enforce low-S (BIP-62 / EIP-2).
  if (s > halfN) {
    s = n - s;
    recoveryId = recoveryId === 0 ? 1 : 0;
  }

  if (s === 0n) {
    throw new Error("invalid signature: s = 0");
  }

  return { r, s, v: recoveryId };
}

/**
 * RFC 6979 deterministic k generation using HMAC-SHA256.
 * This avoids the need for a CSPRNG and ensures signing is deterministic.
 */
function generateDeterministicK(msgHash: Uint8Array, privateKey: Uint8Array, n: bigint): bigint {
  // Initialize per RFC 6979 section 3.2.
  let v: Uint8Array = new Uint8Array(32).fill(0x01);
  let kHmac: Uint8Array = new Uint8Array(32).fill(0x00);

  const privBytes = padTo32(privateKey);
  const hashBytes = padTo32(msgHash);

  // Step d: K = HMAC(K, V || 0x00 || privKey || hash)
  kHmac = hmacSha256(kHmac, concatBytes(v, new Uint8Array([0x00]), privBytes, hashBytes));
  // Step e: V = HMAC(K, V)
  v = hmacSha256(kHmac, v);
  // Step f: K = HMAC(K, V || 0x01 || privKey || hash)
  kHmac = hmacSha256(kHmac, concatBytes(v, new Uint8Array([0x01]), privBytes, hashBytes));
  // Step g: V = HMAC(K, V)
  v = hmacSha256(kHmac, v);

  // Step h: loop until we find a valid k.
  for (let attempt = 0; attempt < 1000; attempt++) {
    v = hmacSha256(kHmac, v);
    const candidate = BigInt(`0x${bytesToHex(v)}`);
    if (candidate > 0n && candidate < n) {
      return candidate;
    }
    kHmac = hmacSha256(kHmac, concatBytes(v, new Uint8Array([0x00])));
    v = hmacSha256(kHmac, v);
  }

  throw new Error("RFC 6979: failed to generate k after 1000 attempts");
}

function hmacSha256(key: Uint8Array, data: Uint8Array): Uint8Array {
  const hmac = createHmac("sha256", key);
  hmac.update(data);
  return new Uint8Array(hmac.digest().buffer);
}

function padTo32(bytes: Uint8Array): Uint8Array {
  if (bytes.length >= 32) return bytes.subarray(0, 32);
  const padded = new Uint8Array(32);
  padded.set(bytes, 32 - bytes.length);
  return padded;
}

function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, a) => sum + a.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Ethereum transaction signing (EIP-155).
// ---------------------------------------------------------------------------

type UnsignedTx = {
  nonce: number;
  gasPrice: bigint;
  gasLimit: number;
  to: string;
  value: bigint;
  data: string;
  chainId: number;
};

/**
 * Sign an EIP-155 transaction and return the RLP-encoded signed transaction hex.
 *
 * EIP-155 signing:
 * 1. RLP encode [nonce, gasPrice, gasLimit, to, value, data, chainId, 0, 0]
 * 2. Keccak-256 hash the encoded data
 * 3. ECDSA sign the hash with the private key
 * 4. v = chainId * 2 + 35 + recoveryId
 * 5. RLP encode [nonce, gasPrice, gasLimit, to, value, data, v, r, s]
 */
function signTransaction(tx: UnsignedTx, privateKeyHex: string): string {
  const privKey = hexToBytes(privateKeyHex.replace(/^0x/, ""));

  // Build unsigned tx fields for EIP-155 hash.
  const fields: RlpInput[] = [
    tx.nonce,
    tx.gasPrice,
    tx.gasLimit,
    hexToBytes(tx.to.replace(/^0x/, "")),
    tx.value,
    hexToBytes(tx.data.replace(/^0x/, "")),
    tx.chainId,
    0,
    0,
  ];

  const unsigned = rlpEncode(fields);
  const hash = keccak256(unsigned);
  const sig = ecdsaSign(hash, privKey);

  // EIP-155: v = chainId * 2 + 35 + recoveryId
  const v = BigInt(tx.chainId) * 2n + 35n + BigInt(sig.v);

  // Build signed transaction.
  const signedFields: RlpInput[] = [
    tx.nonce,
    tx.gasPrice,
    tx.gasLimit,
    hexToBytes(tx.to.replace(/^0x/, "")),
    tx.value,
    hexToBytes(tx.data.replace(/^0x/, "")),
    v,
    sig.r,
    sig.s,
  ];

  return bytesToHex(rlpEncode(signedFields));
}

async function jsonRpcCall(rpcUrl: string, method: string, params: unknown[]): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method, params, id: 1 }),
      signal: controller.signal,
    });
    const json = (await response.json()) as { result?: unknown; error?: { message: string } };
    if (json.error) {
      throw new Error(json.error.message);
    }
    return json.result;
  } finally {
    clearTimeout(timer);
  }
}
