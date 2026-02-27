/**
 * Loop 3: Session Reflection
 *
 * At the end of every session, answer 3 structured questions.
 * Produces compact, machine-readable output for Loop 4 to consume.
 *
 * Template: exactly 3 questions, no more.
 * 1. What worked? (tools/patterns that succeeded on first attempt)
 * 2. What failed and why? (from telemetry, not memory)
 * 3. What should change? (one specific proposal or "nothing")
 *
 * This loop does NOT modify any files, tools, or configurations.
 * Changes are gated through Loop 4 (maintenance pass).
 */
import type { BotPluginApi } from "bot/plugin-sdk";
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { getToolStats, getCurrentSession } from "./telemetry.js";

export interface SessionReflection {
  session_id: string;
  timestamp: string;
  duration_ms: number;
  summary: string;
  what_worked: ToolSuccessEntry[];
  what_failed: ToolFailureEntry[];
  proposed_change: ProposedChange | null;
}

interface ToolSuccessEntry {
  tool_id: string;
  calls: number;
  success_rate: number;
}

interface ToolFailureEntry {
  tool_id: string;
  failure_mode: string;
  count: number;
  root_cause_hypothesis: string;
}

interface ProposedChange {
  type: "new_tool" | "tool_improvement" | "skill_update" | "config_change" | "prompt_update";
  title: string;
  evidence: string;
  expected_impact: string;
}

let reflectionsDir: string | null = null;
let lastReflection: SessionReflection | null = null;

export function createReflectionHooks(api: BotPluginApi) {
  // Initialize storage
  const baseDir = api.resolvePath("~/.hanzo/bot/self-improvement/reflections");
  if (!existsSync(baseDir)) {
    mkdirSync(baseDir, { recursive: true });
  }
  reflectionsDir = baseDir;

  // Load last reflection for context injection
  loadLastReflection();

  return {
    /** Hook: session_end -- generate structured reflection. */
    onSessionEnd: async (_event: any, _ctx: any) => {
      const session = getCurrentSession();
      if (!session) return;

      const stats = getToolStats();
      if (stats.length === 0) return; // No tool calls, nothing to reflect on

      const duration = (session.ended_at ?? Date.now()) - session.started_at;

      // Question 1: What worked?
      const worked: ToolSuccessEntry[] = stats
        .filter((s) => s.success_count > 0)
        .map((s) => ({
          tool_id: s.tool_id,
          calls: s.total_calls,
          success_rate: s.success_count / s.total_calls,
        }))
        .filter((s) => s.success_rate >= 0.8)
        .sort((a, b) => b.calls - a.calls)
        .slice(0, 10);

      // Question 2: What failed and why?
      const failed: ToolFailureEntry[] = [];
      for (const s of stats) {
        if (s.failure_count === 0) continue;
        for (const [mode, count] of Object.entries(s.failure_modes)) {
          failed.push({
            tool_id: s.tool_id,
            failure_mode: mode,
            count,
            root_cause_hypothesis: inferRootCause(s.tool_id, mode, count),
          });
        }
      }
      failed.sort((a, b) => b.count - a.count);

      // Question 3: What should change?
      let proposed: ProposedChange | null = null;

      // Find the most impactful failure pattern
      if (failed.length > 0) {
        const worst = failed[0];
        if (worst.count >= 3) {
          proposed = {
            type: "new_tool",
            title: `Build specific tool to replace ${worst.tool_id} for ${worst.failure_mode} cases`,
            evidence: `${worst.tool_id} failed ${worst.count}x with ${worst.failure_mode} this session`,
            expected_impact: `Eliminate ${worst.failure_mode} failures on ${worst.tool_id}`,
          };
        } else if (worst.count >= 2) {
          proposed = {
            type: "tool_improvement",
            title: `Add ${worst.failure_mode} handling to ${worst.tool_id}`,
            evidence: `${worst.tool_id} failed ${worst.count}x with ${worst.failure_mode}`,
            expected_impact: `Reduce ${worst.failure_mode} failures by >50%`,
          };
        }
      }

      // Build summary line
      const totalCalls = stats.reduce((sum, s) => sum + s.total_calls, 0);
      const totalSuccesses = stats.reduce((sum, s) => sum + s.success_count, 0);
      const successRate = totalCalls > 0 ? ((totalSuccesses / totalCalls) * 100).toFixed(1) : "N/A";
      const summaryParts = [
        `${totalCalls} tool calls (${successRate}% success)`,
        `${failed.length} failure patterns`,
      ];
      if (proposed) {
        summaryParts.push(`proposed: ${proposed.title}`);
      }

      const reflection: SessionReflection = {
        session_id: session.session_id,
        timestamp: new Date().toISOString(),
        duration_ms: duration,
        summary: summaryParts.join(", "),
        what_worked: worked,
        what_failed: failed,
        proposed_change: proposed,
      };

      // Persist
      lastReflection = reflection;
      if (reflectionsDir) {
        try {
          writeFileSync(
            join(reflectionsDir, `${session.session_id}.json`),
            JSON.stringify(reflection, null, 2),
          );
        } catch {
          // Best-effort
        }
      }

      api.logger.info(`[Loop 3] Session reflection: ${reflection.summary}`);
    },

    /** Get last reflection for context injection. */
    getLastReflection(): SessionReflection | null {
      return lastReflection;
    },

    /** Get all reflections for maintenance pass. */
    getRecentReflections(count = 5): SessionReflection[] {
      if (!reflectionsDir) return [];
      try {
        const files = readdirSync(reflectionsDir)
          .filter((f) => f.endsWith(".json"))
          .sort()
          .reverse()
          .slice(0, count);

        return files.map((f) => {
          const content = readFileSync(join(reflectionsDir!, f), "utf-8");
          return JSON.parse(content) as SessionReflection;
        });
      } catch {
        return [];
      }
    },
  };
}

function loadLastReflection(): void {
  if (!reflectionsDir) return;
  try {
    const files = readdirSync(reflectionsDir)
      .filter((f) => f.endsWith(".json"))
      .sort()
      .reverse();
    if (files.length > 0) {
      const content = readFileSync(join(reflectionsDir, files[0]), "utf-8");
      lastReflection = JSON.parse(content);
    }
  } catch {
    // No prior reflections
  }
}

function inferRootCause(toolId: string, failureMode: string, _count: number): string {
  // Deterministic heuristic, not LLM-based
  const hints: Record<string, Record<string, string>> = {
    timeout: {
      bash: "Command exceeded timeout limit; may need larger timeout or async execution",
      default: "Operation exceeded timeout; consider increasing timeout or breaking into steps",
    },
    not_found: {
      bash: "File or command not found; path may be wrong or dependency missing",
      default: "Resource not found; verify path or check if resource needs to be created first",
    },
    parse_error: {
      bash: "Output parsing failed; consider a dedicated tool with structured output",
      default: "Input/output parsing failed; add validation or use typed schema",
    },
    permission: {
      bash: "Permission denied; may need elevated mode or different user context",
      default: "Insufficient permissions; check access control",
    },
    auth: {
      default: "Authentication failed; token may be expired or misconfigured",
    },
    rate_limit: {
      default: "Rate limited; implement backoff or switch to a different provider",
    },
    network: {
      default: "Network failure; check connectivity or add retry logic",
    },
    unknown: {
      default: "Unclassified failure; examine error details in telemetry logs",
    },
  };

  const modeHints = hints[failureMode] ?? hints.unknown;
  return modeHints[toolId] ?? modeHints.default ?? "Unknown root cause";
}
