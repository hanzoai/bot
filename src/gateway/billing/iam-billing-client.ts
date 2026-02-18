/**
 * Gateway-level billing client — calls the Hanzo Commerce API
 * for subscription checks and plan lookups.
 *
 * Replaces the old IamBillingClient. All billing now goes through Commerce.
 */

import type { GatewayIamConfig } from "../../config/config.js";
import type { TenantContext } from "../tenant-context.js";

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

type CacheEntry<T> = { value: T; expiresAt: number };

const CACHE_TTL_MS = 60_000; // 1 minute

const subscriptionCache = new Map<string, CacheEntry<SubscriptionStatus>>();
const planCache = new Map<string, CacheEntry<CommercePlan | null>>();
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

export type CommerceSubscription = {
  id?: string;
  planId?: string;
  userId?: string;
  status?: string;
  name?: string;
  displayName?: string;
  state?: string;
};

export type CommercePlan = {
  slug?: string;
  name?: string;
  description?: string;
  price?: number;
  currency?: string;
  interval?: string;
};

export type SubscriptionStatus = {
  active: boolean;
  subscription: CommerceSubscription | null;
  plan: CommercePlan | null;
};

// ---------------------------------------------------------------------------
// Commerce URL resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the Commerce API base URL.
 * Priority: COMMERCE_API_URL env var > derive from IAM URL > K8s default.
 */
function commerceBaseUrl(_cfg: GatewayIamConfig): string {
  if (process.env.COMMERCE_API_URL) {
    return process.env.COMMERCE_API_URL.replace(/\/+$/, "");
  }
  // K8s in-cluster default
  return "http://commerce.hanzo.svc.cluster.local:8001";
}

function commerceHeaders(cfg: GatewayIamConfig): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  // Use service token if set, otherwise use client credentials
  if (process.env.COMMERCE_SERVICE_TOKEN) {
    headers.Authorization = `Bearer ${process.env.COMMERCE_SERVICE_TOKEN}`;
  } else if (cfg.clientSecret) {
    const basic = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64");
    headers.Authorization = `Basic ${basic}`;
  }
  return headers;
}

// ---------------------------------------------------------------------------
// Singleton reset (testing)
// ---------------------------------------------------------------------------

/** Reset caches (testing). */
export function resetBillingClient(): void {
  subscriptionCache.clear();
  planCache.clear();
  balanceCache.clear();
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Check subscription status for a tenant org via Commerce API.
 * Results are cached for 60 seconds.
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

  const base = commerceBaseUrl(cfg);
  const headers = commerceHeaders(cfg);
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(
      `${base}/api/v1/users/${encodeURIComponent(tenant.orgId)}/subscriptions`,
      { headers, signal: controller.signal },
    );

    if (!res.ok) {
      throw new Error(`Commerce API returned ${res.status}`);
    }

    const subscriptions = (await res.json()) as CommerceSubscription[];
    const activeSub = subscriptions.find((s) => s.status === "active" || s.status === "trialing");

    let plan: CommercePlan | null = null;
    if (activeSub?.planId) {
      plan = await getPlan(cfg, activeSub.planId, token);
    }

    const status: SubscriptionStatus = {
      active: !!activeSub,
      subscription: activeSub ?? null,
      plan,
    };
    setCached(subscriptionCache, cacheKey, status);
    return status;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Get a plan by ID with caching via Commerce API.
 */
export async function getPlan(
  cfg: GatewayIamConfig,
  planId: string,
  token?: string,
): Promise<CommercePlan | null> {
  const cacheKey = `${planId}:${token ?? ""}`;
  const hit = cached(planCache, cacheKey);
  if (hit !== undefined) {
    return hit;
  }

  const base = commerceBaseUrl(cfg);
  const headers = commerceHeaders(cfg);
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(`${base}/api/v1/plan/${encodeURIComponent(planId)}`, {
      headers,
      signal: controller.signal,
    });

    if (!res.ok) {
      setCached(planCache, cacheKey, null);
      return null;
    }

    const plan = (await res.json()) as CommercePlan;
    setCached(planCache, cacheKey, plan);
    return plan;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Get available balance for a user via Commerce billing API.
 * Returns available balance in cents. Cached for 60 seconds.
 */
export async function getBalance(
  cfg: GatewayIamConfig,
  userId: string,
  token?: string,
): Promise<number> {
  const cacheKey = `balance:${userId}:${token ?? ""}`;
  const hit = cached(balanceCache, cacheKey);
  if (hit !== undefined) {
    return hit;
  }

  const base = commerceBaseUrl(cfg);
  const headers = commerceHeaders(cfg);
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(
      `${base}/api/v1/billing/balance?user=${encodeURIComponent(userId)}&currency=usd`,
      { headers, signal: controller.signal },
    );

    if (!res.ok) {
      throw new Error(`Commerce API returned ${res.status}`);
    }

    const data = (await res.json()) as { available?: number };
    const available = data.available ?? 0;
    setCached(balanceCache, cacheKey, available);
    return available;
  } finally {
    clearTimeout(timer);
  }
}
