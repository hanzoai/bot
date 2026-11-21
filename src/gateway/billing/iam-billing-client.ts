/**
 * Gateway-level billing client: what cloud says a caller's plan allows and has
 * left, and the bot wallets of the playground.
 */

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

type CacheEntry<T> = { value: T; expiresAt: number };

const CACHE_TTL_MS = 60_000; // 1 minute

const tierCache = new Map<string, CacheEntry<Tier>>();

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

/** What cloud answers to GET /v1/billing/tier: the caller's plan, what it allows, what is left. */
export type Tier = {
  plan?: string;
  subscription?: string;
  tier: { name: string; allowedModels: string[] };
  balance: { effectiveAvailable: number };
};

// ---------------------------------------------------------------------------
// Commerce URL resolution
// ---------------------------------------------------------------------------

/** The billing API's base URL: cloud, named by COMMERCE_API_URL. */
function commerceBaseUrl(): string {
  const url = process.env.COMMERCE_API_URL;
  if (!url) {
    throw new Error("COMMERCE_API_URL is not set");
  }
  return url.replace(/\/+$/, "");
}

// ---------------------------------------------------------------------------
// Singleton reset (testing)
// ---------------------------------------------------------------------------

/** Reset caches (testing). */
export function resetBillingClient(): void {
  tierCache.clear();
  walletCache.clear();
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

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * The caller's tier: cloud answers for the token it is given, so the plan, the
 * models it allows and the balance are the caller's own. Cached for 60 seconds.
 */
export async function getTier(token: string): Promise<Tier> {
  const hit = cached(tierCache, token);
  if (hit) {
    return hit;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(`${commerceBaseUrl()}/v1/billing/tier`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`billing returned ${res.status}`);
    }
    const tier = (await res.json()) as Tier;
    setCached(tierCache, token, tier);
    return tier;
  } finally {
    clearTimeout(timer);
  }
}
