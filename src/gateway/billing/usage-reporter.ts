/**
 * Usage reporter — records metered acts in cloud's commerce ledger
 * (POST /v1/billing/usage) as the gateway's own IAM application, queued and
 * flushed asynchronously after each completion.
 *
 * Unconfigured it records nothing: configureUsageReporter is what turns it on,
 * and it needs only the gateway IAM config (the base is COMMERCE_API_URL).
 */

import type { GatewayIamConfig } from "../../config/config.js";
import type { TenantContext } from "../tenant-context.js";
import { appToken, commerceBase } from "./commerce.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type UsageRecord = {
  /**
   * Names the act, stable across retries: the ledger debits one id once.
   * At most 128 printable characters, no whitespace.
   */
  id: string;
  /** Tenant billed; its org is the payer. */
  tenant: TenantContext;
  /** The unit the amount prices (e.g. a model id). */
  model: string;
  /** What the act costs, in whole US cents. */
  amountCents: number;
};

// ---------------------------------------------------------------------------
// Queue & batching
// ---------------------------------------------------------------------------

const queue: UsageRecord[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const FLUSH_INTERVAL_MS = 5_000; // Flush every 5 seconds
const MAX_BATCH_SIZE = 50;

let currentIamConfig: GatewayIamConfig | null = null;
let warnedUnconfigured = false;

/**
 * Enqueue a usage record for async reporting.
 * Records are batched and flushed periodically.
 */
export function reportUsage(record: UsageRecord): void {
  if (!currentIamConfig) {
    if (!warnedUnconfigured) {
      warnedUnconfigured = true;
      console.warn("[usage-reporter] not configured: usage is not recorded");
    }
    return;
  }

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
 * Turn usage reporting on with the gateway IAM config, whose application
 * identity signs every report.
 */
export function configureUsageReporter(cfg: GatewayIamConfig): void {
  currentIamConfig = cfg;
}

/** Exact USD decimal for whole cents: 7 -> "0.07", 1234 -> "12.34". */
function usd(cents: number): string {
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

/**
 * Flush pending usage records.
 * Called periodically and on shutdown.
 */
export async function flushUsageQueue(): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }

  const cfg = currentIamConfig;
  if (queue.length === 0 || !cfg) {
    return;
  }

  const batch = queue.splice(0, MAX_BATCH_SIZE);
  const url = `${commerceBase()}/v1/billing/usage`;

  // One report per act; a failed one does not take the rest of the batch with it.
  for (const record of batch) {
    const org = record.tenant.orgId;
    if (!Number.isSafeInteger(record.amountCents) || record.amountCents <= 0) {
      console.warn(
        `[usage-reporter] ${record.id}: amount ${record.amountCents}c is not a positive whole cent; not recorded`,
      );
      continue;
    }
    const payload: Record<string, unknown> = {
      id: record.id,
      org,
      amount: { decimal: usd(record.amountCents), currency: "usd" },
      model: record.model,
    };
    if (record.tenant.projectId) {
      payload.project = record.tenant.projectId;
    }
    try {
      const headers = {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${await appToken(cfg)}`,
        "X-Org-Id": org,
      };
      await sendUsageWithRetry(url, headers, payload);
    } catch (err) {
      // Best-effort: log and drop.
      console.warn(
        `[usage-reporter] ${record.id} (${org}) not recorded: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
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
 * POST a usage record with retry logic. The id makes a retry answer the same
 * receipt, so a retried act is debited once.
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
      const statusMsg = `commerce API ${response.status}: ${errText.substring(0, 200)}`;

      // Only retry on 5xx server errors; 4xx are not retryable.
      if (response.status < 500) {
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
