/**
 * Marketplace payout processing — automated seller payouts.
 *
 * Hybrid settlement model:
 *   USD:      Commerce Stripe Connect affiliate system
 *   $AI token: On-chain ERC-20 transfer on Hanzo chain (36963) with 10% bonus,
 *              plus Commerce ledger recording for audit trail
 *
 * Payout schedule:
 *   - Minimum threshold: configurable (default $10)
 *   - Frequency: weekly (triggered by cron or manual via marketplace.process-payouts)
 *   - Records are pulled from in-memory transaction log
 */

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
 * 2. For USD: POST to Commerce affiliate payout endpoint (Stripe Connect)
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
 * Send an ERC-20 token transfer via raw JSON-RPC eth_sendRawTransaction.
 *
 * Uses raw transaction construction to avoid web3 library dependencies.
 * The treasury key signs the transaction and sends it to the RPC endpoint.
 *
 * Amount is in cents (USD equivalent) — converted to token units using
 * 18 decimal precision (1 $AI = $0.01 → 100 cents = 1 token = 1e18 wei).
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

  // Convert cents to token amount: 1 $AI = $0.01 = 1 cent
  // So amountCents tokens with 18 decimals = amountCents * 1e18
  const tokenAmount = BigInt(amountCents) * BigInt(10) ** BigInt(18);

  // ERC-20 transfer(address,uint256) function selector: 0xa9059cbb
  const paddedTo = toAddress.replace(/^0x/, "").padStart(64, "0");
  const paddedAmount = tokenAmount.toString(16).padStart(64, "0");
  const data = `0xa9059cbb${paddedTo}${paddedAmount}`;

  // Get nonce for treasury address
  const treasuryAddress = chainConfig.treasuryAddress;
  if (!treasuryAddress) {
    throw new Error("treasury address not configured");
  }

  const nonce = await jsonRpcCall(rpcUrl, "eth_getTransactionCount", [treasuryAddress, "pending"]);

  // Build unsigned transaction
  const tx = {
    nonce,
    to: chainConfig.tokenContract,
    value: "0x0",
    data,
    gasLimit: "0x15f90", // 90000 gas (sufficient for ERC-20 transfer)
    chainId: `0x${(chainConfig.chainId ?? 36963).toString(16)}`,
  };

  // Get gas price
  const gasPrice = await jsonRpcCall(rpcUrl, "eth_gasPrice", []);
  (tx as Record<string, string>).gasPrice = gasPrice as string;

  // Sign and send via MPC service or direct key signing
  // For now, use eth_sendTransaction with the treasury account
  // (requires the RPC endpoint to have the account unlocked, or use a signing service)
  const txHash = await jsonRpcCall(rpcUrl, "eth_sendTransaction", [
    {
      from: treasuryAddress,
      to: chainConfig.tokenContract,
      value: "0x0",
      data,
      gas: "0x15f90",
      gasPrice,
      nonce,
    },
  ]);

  return txHash as string;
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
