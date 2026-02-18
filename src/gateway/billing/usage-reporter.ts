/**
 * Usage reporter — asynchronously reports LLM usage to Commerce API
 * after each completion, batching when possible.
 *
 * When IAM is not configured, this is a no-op.
 */

import type { GatewayIamConfig } from "../../config/config.js";
import type { TenantContext } from "../tenant-context.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type UsageRecord = {
  /** Tenant that incurred the usage. */
  tenant: TenantContext;
  /** Model used (e.g. "claude-opus-4-6"). */
  model: string;
  /** Provider (e.g. "anthropic", "openai"). */
  provider: string;
  /** Input tokens. */
  inputTokens: number;
  /** Output tokens. */
  outputTokens: number;
  /** Cache read tokens. */
  cacheReadTokens?: number;
  /** Cache write tokens. */
  cacheWriteTokens?: number;
  /** Total tokens (input + output). */
  totalTokens: number;
  /** Duration of the LLM call in ms. */
  durationMs?: number;
  /** When the usage occurred. */
  timestamp: number;
};

// ---------------------------------------------------------------------------
// Queue & batching
// ---------------------------------------------------------------------------

const queue: UsageRecord[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const FLUSH_INTERVAL_MS = 5_000; // Flush every 5 seconds
const MAX_BATCH_SIZE = 50;

let currentIamConfig: GatewayIamConfig | null = null;

/**
 * Enqueue a usage record for async reporting to IAM.
 * Records are batched and flushed periodically.
 */
export function reportUsage(record: UsageRecord): void {
  queue.push(record);

  // Flush immediately if batch is full
  if (queue.length >= MAX_BATCH_SIZE) {
    void flushUsageQueue();
    return;
  }

  // Schedule a flush if not already scheduled
  if (!flushTimer) {
    flushTimer = setTimeout(() => {
      flushTimer = null;
      void flushUsageQueue();
    }, FLUSH_INTERVAL_MS);
  }
}

/**
 * Set the IAM config for usage reporting.
 * Called once at gateway startup when IAM mode is active.
 */
export function configureUsageReporter(cfg: GatewayIamConfig): void {
  currentIamConfig = cfg;
}

/**
 * Flush all pending usage records to IAM.
 * Called periodically and on shutdown.
 */
export async function flushUsageQueue(): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }

  if (queue.length === 0 || !currentIamConfig) {
    return;
  }

  // Take current batch
  const batch = queue.splice(0, MAX_BATCH_SIZE);

  try {
    // Resolve Commerce API URL
    const baseUrl = (
      process.env.COMMERCE_API_URL ?? "http://commerce.hanzo.svc.cluster.local:8001"
    ).replace(/\/+$/, "");

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    // Auth: prefer service token, fall back to client credentials
    if (process.env.COMMERCE_SERVICE_TOKEN) {
      headers.Authorization = `Bearer ${process.env.COMMERCE_SERVICE_TOKEN}`;
    } else if (currentIamConfig.clientSecret) {
      const basic = Buffer.from(
        `${currentIamConfig.clientId}:${currentIamConfig.clientSecret}`,
      ).toString("base64");
      headers.Authorization = `Basic ${basic}`;
    }

    // Send each record individually to Commerce /api/v1/billing/usage
    for (const record of batch) {
      const payload = {
        user: record.tenant.userId || record.tenant.orgId,
        currency: "usd",
        amount: 0, // Commerce calculates cost from token counts + model
        model: record.model,
        provider: record.provider,
        tokens: record.totalTokens,
        promptTokens: record.inputTokens,
        completionTokens: record.outputTokens,
      };

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);
      try {
        await fetch(`${baseUrl}/api/v1/billing/usage`, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }
    }
  } catch (err) {
    // Usage reporting is best-effort. Log and discard on failure.
    console.warn(
      `[usage-reporter] Failed to report ${batch.length} usage records: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Shutdown: flush any remaining records.
 */
export async function shutdownUsageReporter(): Promise<void> {
  while (queue.length > 0) {
    await flushUsageQueue();
  }
}
