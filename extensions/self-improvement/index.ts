import type { AnyAgentTool, BotPluginApi, BotPluginService } from "bot/plugin-sdk";
import { emptyPluginConfigSchema, onDiagnosticEvent } from "bot/plugin-sdk";
import { createActiveLearningHooks } from "./src/active-learning.js";
import { createFrictionDetector } from "./src/friction-detector.js";
import { createMaintenanceTool } from "./src/maintenance.js";
import { createReflectionHooks } from "./src/reflection.js";
import { createTelemetryService } from "./src/telemetry.js";

const plugin = {
  id: "self-improvement",
  name: "Self-Improvement Engine",
  description:
    "4-loop self-improvement system: telemetry (Loop 0), build-it-now (Loop 1), " +
    "active learning (Loop 2), session reflection (Loop 3), maintenance pass (Loop 4). " +
    "Telemetry-driven, not instruction-based.",
  configSchema: emptyPluginConfigSchema(),

  register(api: BotPluginApi) {
    // ── Loop 0: Telemetry Pipeline (always-on, passive) ─────────────
    api.registerService(createTelemetryService(api));

    // ── Loop 1: Build It Now (friction detection → tool creation) ───
    const frictionDetector = createFrictionDetector(api);
    api.on("after_tool_call", frictionDetector.onToolCall, { priority: 90 });

    // ── Loop 2: Active Learning (hook-driven correction capture) ────
    const activeLearning = createActiveLearningHooks(api);
    api.on("message_received", activeLearning.onMessageReceived, { priority: 80 });
    api.on("after_tool_call", activeLearning.onToolResult, { priority: 70 });

    // ── Loop 3: Session Reflection (end-of-session, 3 questions) ────
    const reflection = createReflectionHooks(api);
    api.on("session_end", reflection.onSessionEnd, { priority: 100 });

    // ── Loop 4: Maintenance Pass Tool (human-gated proposals) ───────
    api.registerTool(createMaintenanceTool(api));

    // ── Inject self-improvement context into agent start ────────────
    api.on(
      "before_agent_start",
      async (_event, _ctx) => {
        const stats = frictionDetector.getSessionStats();
        const facts = activeLearning.getLearnedFacts();
        const lastReflection = reflection.getLastReflection();

        const lines: string[] = [];
        lines.push("## Self-Improvement Context");
        lines.push("");

        if (stats.totalCalls > 0) {
          const rate = ((stats.successes / stats.totalCalls) * 100).toFixed(1);
          lines.push(
            `Session telemetry: ${stats.totalCalls} tool calls, ${rate}% success, ` +
              `${stats.frictionEvents} friction events detected.`,
          );
        }

        if (facts.length > 0) {
          lines.push("");
          lines.push("Learned facts from corrections:");
          for (const fact of facts.slice(-5)) {
            lines.push(`- [${fact.type}] ${fact.description}`);
          }
        }

        if (lastReflection) {
          lines.push("");
          lines.push(`Last session reflection: ${lastReflection.summary}`);
        }

        return {
          prependContext: lines.join("\n"),
        };
      },
      { priority: 50 },
    );
  },
};

export default plugin;
