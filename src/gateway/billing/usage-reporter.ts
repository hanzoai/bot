const BATCH_SIZE = 50;
const FLUSH_INTERVAL_MS = 5000;
const MAX_RETRIES = 3;

export interface UsageEvent {
  userId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  timestamp: number;
}

export class UsageReporter {
  private queue: UsageEvent[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly apiUrl: string;

  constructor(apiUrl?: string) {
    this.apiUrl =
      apiUrl ?? process.env.COMMERCE_API_URL ?? "https://commerce.hanzo.ai/api/v1";
  }

  start(): void {
    if (this.timer) {
      return;
    }
    this.timer = setInterval(() => void this.flush(), FLUSH_INTERVAL_MS);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    void this.flush();
  }

  report(event: UsageEvent): void {
    this.queue.push(event);
    if (this.queue.length >= BATCH_SIZE) {
      void this.flush();
    }
  }

  /** Returns the number of events currently queued. */
  get pending(): number {
    return this.queue.length;
  }

  private async flush(retries = 0): Promise<void> {
    if (this.queue.length === 0) {
      return;
    }
    const batch = this.queue.splice(0, BATCH_SIZE);
    try {
      const res = await fetch(`${this.apiUrl}/billing/usage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ events: batch }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok && retries < MAX_RETRIES) {
        this.queue.unshift(...batch);
        return this.flush(retries + 1);
      }
    } catch {
      if (retries < MAX_RETRIES) {
        this.queue.unshift(...batch);
      }
      // After max retries the batch is silently dropped to prevent
      // unbounded memory growth.
    }
  }
}

export const usageReporter = new UsageReporter();
