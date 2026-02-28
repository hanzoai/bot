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
  /** Node that handled the request (for per-node billing attribution). */
  nodeId?: string;
  /** Override amount in cents (marketplace pricing differs from standard). */
  amountCents?: number;
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
      const payload: Record<string, unknown> = {
        user: record.tenant.userId || record.tenant.orgId,
        currency: "usd",
        amount: record.amountCents ?? 0, // 0 = Commerce calculates; marketplace sends actual price
        model: record.model,
        provider: record.provider,
        tokens: record.totalTokens,
        promptTokens: record.inputTokens,
        completionTokens: record.outputTokens,
      };
      if (record.nodeId) {
        payload.nodeId = record.nodeId;
      }

      await sendUsageWithRetry(`${baseUrl}/api/v1/billing/usage`, headers, payload);
    }
  } catch (err) {
    // Usage reporting is best-effort. Log and discard on failure.
    console.warn(
      `[usage-reporter] Failed to report ${batch.length} usage records: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 500;

/** Sentinel class for non-retryable HTTP errors (4xx). */
class NonRetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NonRetryableError";
  }
}

/**
 * POST a usage record to Commerce API with retry logic.
 * Retries up to MAX_RETRIES times with exponential backoff for 5xx errors.
 * Non-retryable errors (4xx) are thrown immediately.
 */
async function sendUsageWithRetry(
  url: string,
  headers: Record<string, string>,
  payload: Record<string, unknown>,
): Promise<void> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (response.ok) {
        return;
      }

      const errText = await response.text().catch(() => "");
      const statusMsg = `Commerce API ${response.status}: ${errText.substring(0, 200)}`;

      // Only retry on 5xx server errors; 4xx are not retryable.
      if (response.status < 500) {
        console.warn(`[usage-reporter] non-retryable error: ${statusMsg}`);
        throw new NonRetryableError(statusMsg);
      }

      lastError = new Error(statusMsg);
      console.warn(`[usage-reporter] attempt ${attempt + 1}/${MAX_RETRIES} failed: ${statusMsg}`);
    } catch (err) {
      // Non-retryable 4xx errors thrown above bubble up immediately.
      if (err instanceof NonRetryableError) {
        throw err;
      }
      lastError = err instanceof Error ? err : new Error(String(err));
      console.warn(
        `[usage-reporter] attempt ${attempt + 1}/${MAX_RETRIES} error: ${lastError.message}`,
      );
    } finally {
      clearTimeout(timer);
    }

    // Exponential backoff before retry: 500ms, 1000ms, 2000ms.
    if (attempt < MAX_RETRIES - 1) {
      const backoffMs = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
      await new Promise<void>((resolve) => setTimeout(resolve, backoffMs));
    }
  }

  // All retries exhausted.
  throw lastError ?? new Error("usage report failed after retries");
}

/**
 * Shutdown: flush any remaining records.
 */
export async function shutdownUsageReporter(): Promise<void> {
  while (queue.length > 0) {
    await flushUsageQueue();
  }
}
