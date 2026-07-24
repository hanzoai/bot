// Narrow plugin-sdk surface for the bundled runbook plugin.
// Keep this list additive and scoped to symbols used under extensions/runbook.

export {
  applyWindowsSpawnProgramPolicy,
  materializeWindowsSpawnProgram,
  resolveWindowsSpawnProgramCandidate,
} from "./windows-spawn.js";
export type {
  AnyAgentTool,
  BotPluginApi,
  BotPluginToolContext,
  BotPluginToolFactory,
} from "../plugins/types.js";
