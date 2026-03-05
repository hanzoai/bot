// Narrow plugin-sdk surface for the bundled diffs plugin.
// Keep this list additive and scoped to symbols used under extensions/diffs.

export type { BotConfig } from "../config/config.js";
export { resolvePreferredBotTmpDir } from "../infra/tmp-bot-dir.js";
export type {
  AnyAgentTool,
  BotPluginApi,
  BotPluginConfigSchema,
  PluginLogger,
} from "../plugins/types.js";
