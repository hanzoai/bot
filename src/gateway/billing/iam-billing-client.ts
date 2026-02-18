/**
 * Gateway-level billing client — wraps the @hanzo/iam SDK billing client
 * with caching and tenant-aware helpers.
 */

import type { IamConfig, IamSubscription, IamPlan } from "@hanzo/iam";
import { IamBillingClient } from "@hanzo/iam";
import type { GatewayIamConfig } from "../../config/config.js";
import type { TenantContext } from "../tenant-context.js";

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

type CacheEntry<T> = { value: T; expiresAt: number };

const CACHE_TTL_MS = 60_000; // 1 minute

const subscriptionCache = new Map<string, CacheEntry<SubscriptionStatus>>();
const planCache = new Map<string, CacheEntry<IamPlan | null>>();

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

export type SubscriptionStatus = {
  active: boolean;
  subscription: IamSubscription | null;
  plan: IamPlan | null;
};

// ---------------------------------------------------------------------------
// Client singleton
// ---------------------------------------------------------------------------

let billingClient: IamBillingClient | null = null;

function toIamConfig(cfg: GatewayIamConfig): IamConfig {
  return {
    serverUrl: cfg.serverUrl,
    clientId: cfg.clientId,
    clientSecret: cfg.clientSecret,
    orgName: cfg.orgName,
  };
}

export function getIamBillingClient(cfg: GatewayIamConfig): IamBillingClient {
  if (!billingClient) {
    billingClient = new IamBillingClient(toIamConfig(cfg));
  }
  return billingClient;
}

/** Reset singleton (testing). */
export function resetBillingClient(): void {
  billingClient = null;
  subscriptionCache.clear();
  planCache.clear();
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Check subscription status for a tenant org.
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

  const client = getIamBillingClient(cfg);
  const result = await client.isSubscriptionActive(tenant.orgId, token);
  const status: SubscriptionStatus = {
    active: result.active,
    subscription: result.subscription,
    plan: result.plan,
  };
  setCached(subscriptionCache, cacheKey, status);
  return status;
}

/**
 * Get a plan by ID with caching.
 */
export async function getPlan(
  cfg: GatewayIamConfig,
  planId: string,
  token?: string,
): Promise<IamPlan | null> {
  const cacheKey = `${planId}:${token ?? ""}`;
  const hit = cached(planCache, cacheKey);
  if (hit !== undefined) {
    return hit;
  }

  const client = getIamBillingClient(cfg);
  const plan = await client.getPlan(planId, token);
  setCached(planCache, cacheKey, plan);
  return plan;
}
