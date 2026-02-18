/**
 * Usage reporter — asynchronously reports LLM usage to IAM
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
    const baseUrl = currentIamConfig.serverUrl.replace(/\/+$/, "");
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    // Use client credentials for server-to-server auth
    if (currentIamConfig.clientSecret) {
      const basic = Buffer.from(
        `${currentIamConfig.clientId}:${currentIamConfig.clientSecret}`,
      ).toString("base64");
      headers.Authorization = `Basic ${basic}`;
    }

    // Aggregate by org for batched reporting
    const byOrg = new Map<string, UsageRecord[]>();
    for (const record of batch) {
      const orgId = record.tenant.orgId;
      const existing = byOrg.get(orgId);
      if (existing) {
        existing.push(record);
      } else {
        byOrg.set(orgId, [record]);
      }
    }

    for (const [orgId, records] of byOrg) {
      const payload = {
        owner: orgId,
        records: records.map((r) => ({
          model: r.model,
          provider: r.provider,
          inputTokens: r.inputTokens,
          outputTokens: r.outputTokens,
          cacheReadTokens: r.cacheReadTokens ?? 0,
          cacheWriteTokens: r.cacheWriteTokens ?? 0,
          totalTokens: r.totalTokens,
          durationMs: r.durationMs,
          userId: r.tenant.userId,
          projectId: r.tenant.projectId,
          timestamp: new Date(r.timestamp).toISOString(),
        })),
      };

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);
      try {
        await fetch(`${baseUrl}/api/add-usage-record`, {
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
