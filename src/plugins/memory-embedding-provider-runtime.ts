// Runtime bridge for plugin-provided memory embedding providers.
import type { BotConfig } from "../config/types.bot.js";
import { readConfiguredProviderApiId } from "./embedding-provider-config.js";
import {
  getRuntimeEmbeddingProviderAdapter,
  listRuntimeEmbeddingProviderAdapters,
  resolveRuntimeEmbeddingProviderLookupIds,
} from "./embedding-provider-runtime-shared.js";
import {
  getRegisteredMemoryEmbeddingProvider,
  listRegisteredMemoryEmbeddingProviders,
  type MemoryEmbeddingProviderAdapter,
} from "./memory-embedding-providers.js";

export { listRegisteredMemoryEmbeddingProviders };

/** Lists registered memory embedding provider adapters without registry metadata. */
export function listRegisteredMemoryEmbeddingProviderAdapters(): MemoryEmbeddingProviderAdapter[] {
  return listRegisteredMemoryEmbeddingProviders().map((entry) => entry.adapter);
}

/** Lists memory embedding providers from runtime config and registered adapters. */
export function listMemoryEmbeddingProviders(
  cfg?: BotConfig,
): MemoryEmbeddingProviderAdapter[] {
  return listRuntimeEmbeddingProviderAdapters({
    key: "memoryEmbeddingProviders",
    cfg,
    registered: listRegisteredMemoryEmbeddingProviderAdapters(),
  });
}

function resolveConfiguredMemoryEmbeddingProviderId(
  providerId: string,
  cfg?: BotConfig,
): string | undefined {
  return readConfiguredProviderApiId({ providerId, cfg });
}

function resolveMemoryEmbeddingProviderLookupIds(id: string, cfg?: BotConfig): string[] {
  return resolveRuntimeEmbeddingProviderLookupIds({
    id,
    cfg,
    resolveConfiguredProviderId: resolveConfiguredMemoryEmbeddingProviderId,
  });
}

/** Resolves one memory embedding provider by id, alias, or configured API owner. */
export function getMemoryEmbeddingProvider(
  id: string,
  cfg?: BotConfig,
): MemoryEmbeddingProviderAdapter | undefined {
  return getRuntimeEmbeddingProviderAdapter({
    key: "memoryEmbeddingProviders",
    cfg,
    lookupIds: resolveMemoryEmbeddingProviderLookupIds(id, cfg),
    getRegisteredProvider: getRegisteredMemoryEmbeddingProvider,
  });
}
