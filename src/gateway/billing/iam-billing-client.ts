/**
 * Gateway-level billing client: the caller-scoped commerce reads the billing
 * gate makes (balance, subscriptions) against cloud's commerce API, plus the
 * bot wallet reads and deductions against the Playground API.
 */

import type { GatewayIamConfig } from "../../config/config.js";
import type { TenantContext } from "../tenant-context.js";
import { appToken, commerceBase } from "./commerce.js";

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

type CacheEntry<T> = { value: T; expiresAt: number };

const CACHE_TTL_MS = 60_000; // 1 minute

const subscriptionCache = new Map<string, CacheEntry<SubscriptionStatus>>();
const balanceCache = new Map<string, CacheEntry<number>>();

function cached<T>(map: Map<string, CacheEntry<T>>, key: string): T | undefined {
  const entry = map.get(key);
  if (!entry) {
    return undefined;
  }
  if (Date.now() > entry.expiresAt) {
    map.delete(key);
    return undefined;
  }
  return entry.value;
}

function setCached<T>(map: Map<string, CacheEntry<T>>, key: string, value: T): void {
  map.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The plan a subscription is on, as cloud renders it (client.SubscriptionPlan). */
export type CommercePlan = {
  id?: string;
  name?: string;
  /** Cents per interval. */
  price?: number;
  currency?: string;
  interval?: string;
};

/** One subscription row from GET /v1/billing/subscriptions (client.Subscription). */
export type CommerceSubscription = {
  id?: string;
  userId?: string;
  planId?: string;
  status?: string;
  plan?: CommercePlan;
};

export type SubscriptionStatus = {
  active: boolean;
  subscription: CommerceSubscription | null;
  plan: CommercePlan | null;
};

/**
 * The gateway's application token does not act for the org it selected: cloud
 * answered for another account. The gateway is not authorized for that org.
 */
export class OrgNotGrantedError extends Error {
  constructor(orgId: string, account: string) {
    super(
      `commerce answered account "${account}" for org "${orgId}": the gateway is not granted it`,
    );
    this.name = "OrgNotGrantedError";
  }
}

// ---------------------------------------------------------------------------
// Commerce reads
// ---------------------------------------------------------------------------

/**
 * GET a caller-scoped commerce read. A signed-in user's own IAM bearer is
 * forwarded as is: the read is theirs. Without one the gateway acts as its IAM
 * application in the tenant's org, selected with X-Org-Id. A selection the
 * token does not carry falls back to the application's own org, so an
 * application read must be checked against the org it asked for.
 */
async function commerceRead(
  cfg: GatewayIamConfig,
  path: string,
  orgId: string,
  token: string | undefined,
): Promise<unknown> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  } else {
    headers.Authorization = `Bearer ${await appToken(cfg)}`;
    headers["X-Org-Id"] = orgId;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(`${commerceBase()}${path}`, { headers, signal: controller.signal });
    if (!res.ok) {
      throw new Error(`commerce API ${path} returned ${res.status}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Reset caches (testing). */
export function resetBillingClient(): void {
  subscriptionCache.clear();
  balanceCache.clear();
  walletCache.clear();
}

/**
 * Available prepaid balance of the tenant's org, in cents. Cached 60 seconds.
 *
 * Throws OrgNotGrantedError when the gateway read as itself and cloud answered
 * for an account outside `orgId`.
 */
export async function getBalance(
  cfg: GatewayIamConfig,
  orgId: string,
  token?: string,
): Promise<number> {
  const cacheKey = `${orgId}:${token ?? ""}`;
  const hit = cached(balanceCache, cacheKey);
  if (hit !== undefined) {
    return hit;
  }

  const data = (await commerceRead(cfg, "/v1/billing/balance", orgId, token)) as {
    available?: unknown;
    account?: unknown;
  } | null;
  if (!token) {
    const account = typeof data?.account === "string" ? data.account : "";
    if (account !== orgId && !account.startsWith(`${orgId}/`)) {
      throw new OrgNotGrantedError(orgId, account);
    }
  }
  if (typeof data?.available !== "number") {
    throw new Error("commerce balance carries no available");
  }
  setCached(balanceCache, cacheKey, data.available);
  return data.available;
}

/**
 * The tenant org's subscription standing. Cached 60 seconds.
 *
 * The rows carry no account to check an application read against, so the gate
 * asks this only after getBalance has proved the same credential acts for the
 * same org.
 */
export async function getSubscriptionStatus(
  cfg: GatewayIamConfig,
  tenant: TenantContext,
  token?: string,
): Promise<SubscriptionStatus> {
  const cacheKey = `${tenant.orgId}:${token ?? ""}`;
  const hit = cached(subscriptionCache, cacheKey);
  if (hit) {
    return hit;
  }

  const data = (await commerceRead(cfg, "/v1/billing/subscriptions", tenant.orgId, token)) as {
    subscriptions?: unknown;
  } | null;
  if (!Array.isArray(data?.subscriptions)) {
    throw new Error("commerce subscriptions carries no subscriptions");
  }
  const rows = data.subscriptions as CommerceSubscription[];
  const active = rows.find((s) => s?.status === "active" || s?.status === "trialing");
  const status: SubscriptionStatus = {
    active: !!active,
    subscription: active ?? null,
    plan: active?.plan ?? null,
  };
  setCached(subscriptionCache, cacheKey, status);
  return status;
}

// ---------------------------------------------------------------------------
// Bot Wallet Balance (via Playground API)
// ---------------------------------------------------------------------------

const walletCache = new Map<string, CacheEntry<number>>();

/**
 * Get the bot wallet balance from the Playground API.
 * Returns available USD balance in cents. Cached for 30 seconds.
 * Returns -1 if wallet doesn't exist (not enabled, should not gate).
 */
export async function getWalletBalance(botId: string): Promise<number> {
  const cacheKey = `wallet:${botId}`;
  const hit = cached(walletCache, cacheKey);
  if (hit !== undefined) {
    return hit;
  }

  const playgroundUrl = process.env.PLAYGROUND_URL || "http://hanzo-playground.hanzo.svc:8080";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  try {
    const res = await fetch(`${playgroundUrl}/v1/bots/${encodeURIComponent(botId)}/wallet`, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });

    if (!res.ok) {
      // Wallet doesn't exist — return -1 (don't gate)
      setCached(walletCache, cacheKey, -1);
      return -1;
    }

    const data = (await res.json()) as { usd_balance_cents?: number; enabled?: boolean };
    if (!data.enabled) {
      setCached(walletCache, cacheKey, -1);
      return -1;
    }
    const balance = data.usd_balance_cents ?? 0;
    // Shorter TTL for wallet balance (30s)
    walletCache.set(cacheKey, { value: balance, expiresAt: Date.now() + 30_000 });
    return balance;
  } catch {
    // Playground unreachable — don't gate (fail-open for wallet)
    return -1;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Bot Wallet Usage Deduction
// ---------------------------------------------------------------------------

/**
 * Deduct LLM usage cost from a bot wallet via the Playground API.
 * This is fire-and-forget — failures are logged but not thrown.
 * Returns true if deduction succeeded.
 */
export async function deductWalletUsage(params: {
  botId: string;
  amountUsdCents: number;
  model?: string;
  provider?: string;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  description?: string;
}): Promise<boolean> {
  if (!params.botId || params.amountUsdCents <= 0) {
    return false;
  }

  const playgroundUrl = process.env.PLAYGROUND_URL || "http://hanzo-playground.hanzo.svc:8080";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(
      `${playgroundUrl}/v1/bots/${encodeURIComponent(params.botId)}/wallet/deduct-usage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          amount_usd_cents: params.amountUsdCents,
          model: params.model ?? "unknown",
          provider: params.provider ?? "unknown",
          input_tokens: params.inputTokens ?? 0,
          output_tokens: params.outputTokens ?? 0,
          cache_read_tokens: params.cacheReadTokens ?? 0,
          cache_write_tokens: params.cacheWriteTokens ?? 0,
          description: params.description,
        }),
        signal: controller.signal,
      },
    );

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.warn(
        `[wallet-usage] Failed to deduct ${params.amountUsdCents}c from bot ${params.botId}: ${res.status} ${errText.substring(0, 200)}`,
      );
      return false;
    }

    console.log(
      `[wallet-usage] Deducted ${params.amountUsdCents}c from bot ${params.botId} (${params.model}, ${params.inputTokens ?? 0}in/${params.outputTokens ?? 0}out)`,
    );
    return true;
  } catch (err) {
    console.warn(
      `[wallet-usage] Error deducting from bot ${params.botId}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return false;
  } finally {
    clearTimeout(timer);
  }
}
