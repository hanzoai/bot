// Memory-facing runtime facade for plugin registration, embeddings, and prompt artifacts.
// Re-export only stable host seams; plugin implementations should not import core internals.
export {
  buildActiveMemoryPromptSection,
  emptyPluginConfigSchema,
  getMemoryCapabilityRegistration,
  getMemoryEmbeddingProvider,
  listActiveMemoryPublicArtifacts,
  listMemoryEmbeddingProviders,
  listRegisteredMemoryEmbeddingProviderAdapters,
  listRegisteredMemoryEmbeddingProviders,
  resolveCanonicalRootMemoryFile,
  shouldSkipRootMemoryAuxiliaryPath,
} from "./bot-runtime.js";
export type {
  MemoryEmbeddingBatchChunk,
  MemoryEmbeddingBatchOptions,
  MemoryEmbeddingProvider,
  MemoryEmbeddingProviderAdapter,
  MemoryEmbeddingProviderCallOptions,
  MemoryEmbeddingProviderCreateOptions,
  MemoryEmbeddingProviderCreateResult,
  MemoryEmbeddingProviderRuntime,
  MemoryFlushPlan,
  MemoryFlushPlanResolver,
  MemoryPluginCapability,
  MemoryPluginPublicArtifact,
  MemoryPluginPublicArtifactsProvider,
  MemoryPluginRuntime,
  MemoryPromptSectionBuilder,
  BotPluginApi,
} from "./bot-runtime.js";
