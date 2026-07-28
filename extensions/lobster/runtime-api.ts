// Lobster API module exposes the plugin public contract.
export { definePluginEntry } from "bot/plugin-sdk/core";
export type {
  AnyAgentTool,
  BotPluginApi,
  BotPluginToolContext,
  BotPluginToolFactory,
} from "bot/plugin-sdk/core";
export {
  applyWindowsSpawnProgramPolicy,
  materializeWindowsSpawnProgram,
  resolveWindowsSpawnProgramCandidate,
} from "bot/plugin-sdk/windows-spawn";
