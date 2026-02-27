/**
 * Loop 0: Telemetry Pipeline
 *
 * Always-on, passive, append-only structured logging of every tool call.
 * The substrate that all other loops read from.
 *
 * Storage: JSONL files per session, optionally forwarded to NATS JetStream.
 * Retention: 90 days raw, then compacted to daily summaries.
 */
import type { BotPluginApi, BotPluginService, DiagnosticEventPayload } from "bot/plugin-sdk";
import { onDiagnosticEvent } from "bot/plugin-sdk";
import { appendFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

export interface ToolInvocation {
  tool_id: string;
  session_id: string;
  agent_id: string;
  timestamp_ms: number;
  duration_ms: number;
  success: boolean;
  failure_mode?: "timeout" | "auth" | "validation" | "model_error" | "unknown";
  input_tokens?: number;
  output_tokens?: number;
  cost_usd?: number;
  retries: number;
  user_corrected: boolean;
  context: {
    channel: string;
    domain?: string;
    task_type?: string;
  };
}

export interface ToolStats {
  tool_id: string;
  total_calls: number;
  success_count: number;
  failure_count: number;
  total_duration_ms: number;
  avg_duration_ms: number;
  failure_modes: Record<string, number>;
  last_used: number;
}

export interface SessionTelemetry {
  session_id: string;
  started_at: number;
  ended_at?: number;
  invocations: ToolInvocation[];
  tool_stats: Map<string, ToolStats>;
}

/** In-memory session telemetry (current session only). */
let currentSession: SessionTelemetry | null = null;
let telemetryDir: string | null = null;

export function getCurrentSession(): SessionTelemetry | null {
  return currentSession;
}

export function getToolStats(): ToolStats[] {
  if (!currentSession) return [];
  return Array.from(currentSession.tool_stats.values());
}

export function getAggregateStats(): {
  totalCalls: number;
  successes: number;
  failures: number;
  frictionEvents: number;
} {
  if (!currentSession) {
    return { totalCalls: 0, successes: 0, failures: 0, frictionEvents: 0 };
  }
  const stats = Array.from(currentSession.tool_stats.values());
  let totalCalls = 0;
  let successes = 0;
  let failures = 0;
  for (const s of stats) {
    totalCalls += s.total_calls;
    successes += s.success_count;
    failures += s.failure_count;
  }
  return { totalCalls, successes, failures, frictionEvents: failures };
}

function recordInvocation(inv: ToolInvocation): void {
  if (!currentSession) {
    currentSession = {
      session_id: `session-${Date.now()}`,
      started_at: Date.now(),
      invocations: [],
      tool_stats: new Map(),
    };
  }

  currentSession.invocations.push(inv);

  // Update per-tool stats
  let stats = currentSession.tool_stats.get(inv.tool_id);
  if (!stats) {
    stats = {
      tool_id: inv.tool_id,
      total_calls: 0,
      success_count: 0,
      failure_count: 0,
      total_duration_ms: 0,
      avg_duration_ms: 0,
      failure_modes: {},
      last_used: 0,
    };
    currentSession.tool_stats.set(inv.tool_id, stats);
  }

  stats.total_calls++;
  if (inv.success) {
    stats.success_count++;
  } else {
    stats.failure_count++;
    if (inv.failure_mode) {
      stats.failure_modes[inv.failure_mode] = (stats.failure_modes[inv.failure_mode] ?? 0) + 1;
    }
  }
  stats.total_duration_ms += inv.duration_ms;
  stats.avg_duration_ms = stats.total_duration_ms / stats.total_calls;
  stats.last_used = inv.timestamp_ms;

  // Append to JSONL file
  persistInvocation(inv);
}

function persistInvocation(inv: ToolInvocation): void {
  if (!telemetryDir) return;
  try {
    const file = join(telemetryDir, `${currentSession!.session_id}.jsonl`);
    appendFileSync(file, JSON.stringify(inv) + "\n");
  } catch {
    // Telemetry persistence is best-effort; never block the agent.
  }
}

export function createTelemetryService(api: BotPluginApi): BotPluginService {
  let unsubscribe: (() => void) | null = null;

  return {
    id: "self-improvement-telemetry",

    async start(ctx) {
      // Initialize telemetry directory
      const baseDir = api.resolvePath("~/.hanzo/bot/telemetry");
      if (!existsSync(baseDir)) {
        mkdirSync(baseDir, { recursive: true });
      }
      telemetryDir = baseDir;

      // Reset current session
      currentSession = {
        session_id: `session-${Date.now()}`,
        started_at: Date.now(),
        invocations: [],
        tool_stats: new Map(),
      };

      // Subscribe to diagnostic events for model.usage tracking
      unsubscribe = onDiagnosticEvent((evt: DiagnosticEventPayload) => {
        if (evt.type === "model.usage") {
          recordInvocation({
            tool_id: `llm:${evt.model ?? "unknown"}`,
            session_id: currentSession?.session_id ?? "unknown",
            agent_id: "default",
            timestamp_ms: Date.now(),
            duration_ms: evt.durationMs ?? 0,
            success: true,
            input_tokens: evt.usage?.input,
            output_tokens: evt.usage?.output,
            cost_usd: evt.costUsd,
            retries: 0,
            user_corrected: false,
            context: { channel: evt.channel ?? "unknown" },
          });
        }
      });

      ctx.logger.info("self-improvement-telemetry: pipeline started");
    },

    async stop() {
      if (currentSession) {
        currentSession.ended_at = Date.now();

        // Write session summary
        if (telemetryDir) {
          try {
            const summaryFile = join(telemetryDir, `${currentSession.session_id}.summary.json`);
            const summary = {
              session_id: currentSession.session_id,
              started_at: currentSession.started_at,
              ended_at: currentSession.ended_at,
              total_invocations: currentSession.invocations.length,
              tool_stats: Object.fromEntries(currentSession.tool_stats),
            };
            const { writeFileSync } = await import("node:fs");
            writeFileSync(summaryFile, JSON.stringify(summary, null, 2));
          } catch {
            // Best-effort
          }
        }
      }

      unsubscribe?.();
      unsubscribe = null;
    },
  };
}

/** Called by friction detector and other loops to record tool invocations. */
export { recordInvocation };
