/**
 * Token-bucket rate limiter for gateway request throughput.
 *
 * Tracks per-user (or per-connection) request rates and enforces
 * tier-based limits on billable methods (agent, agent.wait, chat.send).
 *
 * Design decisions:
 * - Pure in-memory Map -- no external dependencies; suitable for a single
 *   gateway process. The Map is periodically pruned to avoid unbounded
 *   growth.
 * - Token bucket algorithm: tokens refill continuously at a fixed rate.
 *   Bursts are allowed up to the bucket capacity (burstSize). When the
 *   bucket is empty, requests are rejected with a retry-after hint.
 * - The module is side-effect-free: callers create an instance via
 *   {@link createRequestRateLimiter} and pass it where needed.
 */

import type { RequestRateLimitConfig } from "../config/types.gateway.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RateLimitTier {
  /** Display name for the tier. */
  name: string;
  /** Maximum sustained requests per minute. */
  requestsPerMinute: number;
  /** Burst capacity — tokens available immediately after idle. */
  burstSize: number;
}

export interface RequestRateLimitResult {
  /** Whether the request is allowed to proceed. */
  allowed: boolean;
  /** Milliseconds until the next token becomes available (0 when allowed). */
  retryAfterMs: number;
  /** Remaining tokens in the bucket after this check (0 when denied). */
  remaining: number;
}

export interface RequestRateLimiter {
  /** Attempt to consume one token for the given key (userId or connId). */
  tryConsume(key: string, tier?: string): RequestRateLimitResult;
  /** Return the current number of tracked buckets (useful for diagnostics). */
  size(): number;
  /** Remove stale buckets that have fully refilled. */
  prune(): void;
  /** Dispose the limiter and cancel periodic cleanup timers. */
  shutdown(): void;
}

// ---------------------------------------------------------------------------
// Tier definitions — canonical zen-* naming convention
// ---------------------------------------------------------------------------

export const RATE_LIMIT_TIERS: Record<string, RateLimitTier> = {
  "zen-free": { name: "zen-free", requestsPerMinute: 60, burstSize: 15 },
  "zen-pro": { name: "zen-pro", requestsPerMinute: 500, burstSize: 75 },
  "zen-team": { name: "zen-team", requestsPerMinute: 2000, burstSize: 300 },
  "zen-enterprise": { name: "zen-enterprise", requestsPerMinute: 50000, burstSize: 5000 },
  "zen-custom": { name: "zen-custom", requestsPerMinute: 100000, burstSize: 10000 },
};

const DEFAULT_TIER = "zen-free";

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_REQUESTS_PER_MINUTE = 60;
const DEFAULT_BURST_SIZE = 15;
const DEFAULT_CLEANUP_INTERVAL_MS = 60_000;

/** Buckets idle for longer than this are pruned. */
const STALE_BUCKET_THRESHOLD_MS = 5 * 60_000; // 5 minutes

// ---------------------------------------------------------------------------
// Token bucket
// ---------------------------------------------------------------------------

interface TokenBucket {
  /** Current number of available tokens. */
  tokens: number;
  /** Maximum tokens this bucket can hold (burst capacity). */
  capacity: number;
  /** Token refill rate: tokens per millisecond. */
  refillRatePerMs: number;
  /** Epoch ms of the last token refill calculation. */
  lastRefillMs: number;
  /** Epoch ms of the last consume attempt (used for stale detection). */
  lastActivityMs: number;
}

function createBucket(tier: RateLimitTier, nowMs: number): TokenBucket {
  return {
    tokens: tier.burstSize,
    capacity: tier.burstSize,
    refillRatePerMs: tier.requestsPerMinute / 60_000,
    lastRefillMs: nowMs,
    lastActivityMs: nowMs,
  };
}

function refillBucket(bucket: TokenBucket, nowMs: number): void {
  const elapsed = nowMs - bucket.lastRefillMs;
  if (elapsed <= 0) {
    return;
  }
  bucket.tokens = Math.min(bucket.capacity, bucket.tokens + elapsed * bucket.refillRatePerMs);
  bucket.lastRefillMs = nowMs;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

function resolveTier(tierName: string | undefined): RateLimitTier {
  if (!tierName) {
    return RATE_LIMIT_TIERS[DEFAULT_TIER];
  }
  const lower = tierName.toLowerCase().trim();
  return RATE_LIMIT_TIERS[lower] ?? RATE_LIMIT_TIERS[DEFAULT_TIER];
}

/**
 * Map a billing PlanTier (Commerce plan name) to a canonical zen-* rate-limit
 * tier name. Handles both old naming (developer/pro/team/enterprise) and
 * new zen-* naming for backward compatibility.
 */
export function billingTierToRateLimitTier(planTier: string | undefined): string {
  if (!planTier) {
    return DEFAULT_TIER;
  }
  const lower = planTier.toLowerCase().trim();
  switch (lower) {
    case "zen-free":
    case "free":
    case "developer":
      return "zen-free";
    case "zen-pro":
    case "pro":
    case "starter":
      return "zen-pro";
    case "zen-team":
    case "team":
      return "zen-team";
    case "zen-enterprise":
    case "enterprise":
    case "scale":
      return "zen-enterprise";
    case "zen-custom":
    case "custom":
      return "zen-custom";
    default:
      return DEFAULT_TIER;
  }
}

export function createRequestRateLimiter(config?: RequestRateLimitConfig): RequestRateLimiter {
  const requestsPerMinute = config?.requestsPerMinute ?? DEFAULT_REQUESTS_PER_MINUTE;
  const burstSize = config?.burstSize ?? DEFAULT_BURST_SIZE;
  const cleanupIntervalMs = config?.cleanupIntervalMs ?? DEFAULT_CLEANUP_INTERVAL_MS;

  // When config overrides are provided, build a custom "config" tier that
  // takes precedence over the named tiers for the default/fallback case.
  const configTier: RateLimitTier = {
    name: "config",
    requestsPerMinute,
    burstSize,
  };

  const buckets = new Map<string, TokenBucket>();

  const pruneTimer = cleanupIntervalMs > 0 ? setInterval(() => prune(), cleanupIntervalMs) : null;
  if (pruneTimer?.unref) {
    pruneTimer.unref();
  }

  function tryConsume(key: string, tier?: string): RequestRateLimitResult {
    const nowMs = Date.now();
    const resolvedTier = tier ? resolveTier(tier) : configTier;
    let bucket = buckets.get(key);

    if (!bucket) {
      bucket = createBucket(resolvedTier, nowMs);
      buckets.set(key, bucket);
    } else {
      // Update capacity/rate if the tier changed (e.g. user upgraded).
      bucket.capacity = resolvedTier.burstSize;
      bucket.refillRatePerMs = resolvedTier.requestsPerMinute / 60_000;
      refillBucket(bucket, nowMs);
    }

    bucket.lastActivityMs = nowMs;

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return {
        allowed: true,
        retryAfterMs: 0,
        remaining: Math.floor(bucket.tokens),
      };
    }

    // Bucket empty -- compute when the next token will be available.
    const msPerToken = 1 / bucket.refillRatePerMs;
    const deficit = 1 - bucket.tokens;
    const retryAfterMs = Math.ceil(deficit * msPerToken);

    return {
      allowed: false,
      retryAfterMs,
      remaining: 0,
    };
  }

  function prune(): void {
    const nowMs = Date.now();
    for (const [key, bucket] of buckets) {
      // If the bucket has been idle long enough, remove it regardless of token state.
      if (nowMs - bucket.lastActivityMs >= STALE_BUCKET_THRESHOLD_MS) {
        buckets.delete(key);
      }
    }
  }

  function size(): number {
    return buckets.size;
  }

  function shutdown(): void {
    if (pruneTimer) {
      clearInterval(pruneTimer);
    }
    buckets.clear();
  }

  return { tryConsume, size, prune, shutdown };
}
