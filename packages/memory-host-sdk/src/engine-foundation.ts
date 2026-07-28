// Real workspace contract for memory engine foundation concerns.

export {
  resolveAgentContextLimits,
  resolveAgentDir,
  resolveAgentWorkspaceDir,
  resolveDefaultAgentId,
  resolveSessionAgentId,
} from "./host/bot-runtime-agent.js";
export {
  resolveMemorySearchConfig,
  resolveMemorySearchSyncConfig,
  type ResolvedMemorySearchConfig,
  type ResolvedMemorySearchSyncConfig,
} from "./host/bot-runtime-agent.js";
export { parseDurationMs } from "./host/bot-runtime-config.js";
export { loadConfig } from "./host/bot-runtime-config.js";
export { resolveStateDir } from "./host/bot-runtime-config.js";
export { resolveSessionTranscriptsDirForAgent } from "./host/bot-runtime-config.js";
export {
  hasConfiguredSecretInput,
  normalizeResolvedSecretInputString,
} from "./host/bot-runtime-config.js";
export { root } from "./host/bot-runtime-io.js";
export { isPathInside } from "./host/fs-utils.js";
export { createSubsystemLogger } from "./host/bot-runtime-io.js";
export { detectMime } from "./host/bot-runtime-io.js";
export { resolveGlobalSingleton } from "./host/bot-runtime-io.js";
export { onSessionTranscriptUpdate } from "./host/bot-runtime-session.js";
export { splitShellArgs } from "./host/bot-runtime-io.js";
export { runTasksWithConcurrency } from "./host/bot-runtime-io.js";
export {
  shortenHomeInString,
  shortenHomePath,
  resolveUserPath,
  truncateUtf16Safe,
} from "./host/bot-runtime-io.js";
export type { BotConfig } from "./host/bot-runtime-config.js";
export type { SessionSendPolicyConfig } from "./host/bot-runtime-config.js";
export type { SecretInput } from "./host/bot-runtime-config.js";
export type {
  MemoryBackend,
  MemoryCitationsMode,
  MemoryQmdConfig,
  MemoryQmdIndexPath,
  MemoryQmdSearchMode,
} from "./host/bot-runtime-config.js";
export type { MemorySearchConfig } from "./host/bot-runtime-config.js";
