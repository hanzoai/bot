// Narrow plugin-sdk surface for the bundled diffs plugin.
// Keep this list additive and scoped to symbols used under extensions/diffs.

export type { BotConfig } from "../config/config.js";
export { resolvePreferredOpenClawTmpDir } from "../infra/tmp-openclaw-dir.js";
export type {
  AnyAgentTool,
  BotPluginApi,
  OpenClawPluginConfigSchema,
  PluginLogger,
} from "../plugins/types.js";
