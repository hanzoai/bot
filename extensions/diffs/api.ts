// Diffs API module exposes the plugin public contract.
export type { BotConfig } from "bot/plugin-sdk/config-contracts";
export {
  definePluginEntry,
  type AnyAgentTool,
  type BotPluginApi,
  type BotPluginConfigSchema,
  type BotPluginToolContext,
  type PluginLogger,
} from "bot/plugin-sdk/plugin-entry";
export { resolvePreferredBotTmpDir } from "bot/plugin-sdk/temp-path";
