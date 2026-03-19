// Narrow plugin-sdk surface for the bundled diffs plugin.
// Keep this list additive and scoped to symbols used under extensions/diffs.

export { definePluginEntry } from "./core.js";
export type { HanzoBotConfig } from "../config/config.js";
export { resolvePreferredHanzoBotTmpDir } from "../infra/tmp-openclaw-dir.js";
export type {
  AnyAgentTool,
  HanzoBotPluginApi,
  HanzoBotPluginConfigSchema,
  HanzoBotPluginToolContext,
  PluginLogger,
} from "../plugins/types.js";
