/**
 * Registers the `/codex` plugin command and lazy-loads the app-server command
 * handler implementation.
 */
import type { BotPluginCommandDefinition } from "bot/plugin-sdk/plugin-entry";
import { handleCodexCommand } from "./command-dispatch.js";
import type { CodexCommandDepsOverride } from "./command-handlers.js";

type CodexCommandOptions = {
  pluginConfig?: unknown;
  resolvePluginConfig?: () => unknown;
  deps: CodexCommandDepsOverride;
};

/** Creates the reserved `/codex` command definition exposed by the plugin. */
export function createCodexCommand(options: CodexCommandOptions): BotPluginCommandDefinition {
  return {
    name: "codex",
    description: "Inspect and control the Codex app-server harness",
    ownership: "reserved",
    agentPromptGuidance: [
      {
        text: "Native Codex app-server plugin is available (`/codex ...`). For Codex bind/control/thread/resume/steer/stop requests, prefer `/codex bind`, `/codex threads`, `/codex resume`, `/codex steer`, and `/codex stop` over ACP. When Bot sandboxing is active, native Codex execution modes are unavailable; use normal Codex harness turns.",
        surfaces: ["bot_main"],
      },
      {
        text: "Use ACP for Codex only when the user explicitly asks for ACP/acpx or wants to test the ACP path.",
        surfaces: ["bot_main"],
      },
    ],
    acceptsArgs: true,
    requireAuth: true,
    handler: (ctx) => handleCodexCommand(ctx, options),
  };
}
