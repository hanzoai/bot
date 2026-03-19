// Narrow plugin-sdk surface for the bundled diffs plugin.
// Keep this list additive and scoped to symbols used under extensions/diffs.

export { definePluginEntry } from "./core.js";
export type { Hanzo BotConfig } from "../config/config.js";
export { resolvePreferredHanzo BotTmpDir } from "../infra/tmp-openclaw-dir.js";
export type {
  AnyAgentTool,
  Hanzo BotPluginApi,
  Hanzo BotPluginConfigSchema,
  Hanzo BotPluginToolContext,
  PluginLogger,
} from "../plugins/types.js";
