export type BillingGateMode = "open" | "warn" | "enforce";

const BILLING_CACHE_TTL_MS = 60_000;

interface BillingCacheEntry {
  allowed: boolean;
  tier: string;
  cachedAt: number;
}

const billingCache = new Map<string, BillingCacheEntry>();

export function getBillingGateMode(): BillingGateMode {
  const envMode = process.env.BILLING_GATE_MODE;
  if (envMode === "open" || envMode === "warn" || envMode === "enforce") {
    return envMode;
  }
  return "open";
}

export interface BillingAllowanceResult {
  allowed: boolean;
  tier: string;
  reason?: string;
}

export async function checkBillingAllowance(
  userId: string,
  commerceApiUrl?: string,
): Promise<BillingAllowanceResult> {
  const cached = billingCache.get(userId);
  if (cached && Date.now() - cached.cachedAt < BILLING_CACHE_TTL_MS) {
    return { allowed: cached.allowed, tier: cached.tier };
  }

  const apiUrl =
    commerceApiUrl ?? process.env.COMMERCE_API_URL ?? "https://commerce.hanzo.ai/api/v1";
  try {
    const res = await fetch(
      `${apiUrl}/billing/allowance?userId=${encodeURIComponent(userId)}`,
      {
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!res.ok) {
      return { allowed: true, tier: "unknown", reason: "billing-api-unavailable" };
    }
    const data = (await res.json()) as { allowed: boolean; tier: string };
    billingCache.set(userId, { ...data, cachedAt: Date.now() });
    return data;
  } catch {
    return { allowed: true, tier: "unknown", reason: "billing-api-error" };
  }
}

/**
 * Evict stale entries from the billing cache. Exposed for testing and
 * periodic maintenance; the cache is self-pruning on read so calling
 * this is optional.
 */
export function pruneBillingCache(): void {
  const now = Date.now();
  for (const [key, entry] of billingCache) {
    if (now - entry.cachedAt >= BILLING_CACHE_TTL_MS) {
      billingCache.delete(key);
    }
  }
}
