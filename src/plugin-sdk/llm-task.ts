// Narrow plugin-sdk surface for the bundled llm-task plugin.
// Keep this list additive and scoped to symbols used under extensions/llm-task.

export { resolvePreferredBotTmpDir } from "../infra/tmp-bot-dir.js";
export type { AnyAgentTool, BotPluginApi } from "../plugins/types.js";
