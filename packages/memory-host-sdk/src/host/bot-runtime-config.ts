// Config-facing runtime facade for memory host packages.
// This keeps memory plugins off broader core config modules and their private helpers.
export {
  getRuntimeConfig,
  hasConfiguredSecretInput,
  loadConfig,
  normalizeResolvedSecretInputString,
  parseDurationMs,
  parseNonNegativeByteSize,
  resolveSessionTranscriptsDirForAgent,
  resolveStateDir,
} from "./bot-runtime.js";
export type {
  MemoryBackend,
  MemoryCitationsMode,
  MemoryQmdConfig,
  MemoryQmdIndexPath,
  MemoryQmdSearchMode,
  MemorySearchConfig,
  BotConfig,
  SecretInput,
  SessionSendPolicyConfig,
} from "./bot-runtime.js";
