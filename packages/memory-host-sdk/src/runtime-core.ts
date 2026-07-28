// Focused runtime contract for memory plugin config/state/helpers.

export type { AnyAgentTool } from "./host/bot-runtime-agent.js";
export { resolveCronStyleNow } from "./host/bot-runtime-agent.js";
export { DEFAULT_AGENT_COMPACTION_RESERVE_TOKENS_FLOOR } from "./host/bot-runtime-agent.js";
export { resolveDefaultAgentId, resolveSessionAgentId } from "./host/bot-runtime-agent.js";
export { resolveMemorySearchConfig } from "./host/bot-runtime-agent.js";
export {
  asToolParamsRecord,
  jsonResult,
  readNumberParam,
  readStringParam,
} from "./host/bot-runtime-agent.js";
export { SILENT_REPLY_TOKEN } from "./host/bot-runtime-session.js";
export { parseNonNegativeByteSize } from "./host/bot-runtime-config.js";
export {
  getRuntimeConfig,
  /** @deprecated Use getRuntimeConfig(), or pass the already loaded config through the call path. */
  loadConfig,
} from "./host/bot-runtime-config.js";
export { resolveStateDir } from "./host/bot-runtime-config.js";
export { resolveSessionTranscriptsDirForAgent } from "./host/bot-runtime-config.js";
export { emptyPluginConfigSchema } from "./host/bot-runtime-memory.js";
export {
  buildActiveMemoryPromptSection,
  getMemoryCapabilityRegistration,
  listActiveMemoryPublicArtifacts,
} from "./host/bot-runtime-memory.js";
export { parseAgentSessionKey } from "./host/bot-runtime-agent.js";
export type { BotConfig } from "./host/bot-runtime-config.js";
export type { MemoryCitationsMode } from "./host/bot-runtime-config.js";
export type {
  MemoryFlushPlan,
  MemoryFlushPlanResolver,
  MemoryPluginCapability,
  MemoryPluginPublicArtifact,
  MemoryPluginPublicArtifactsProvider,
  MemoryPluginRuntime,
  MemoryPromptSectionBuilder,
} from "./host/bot-runtime-memory.js";
export type { BotPluginApi } from "./host/bot-runtime-memory.js";
