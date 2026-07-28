import { normalizeProviderId } from "@hanzo/bot-model-catalog-core/provider-id";
import type { BotConfig } from "../config/types.bot.js";

type ConfiguredModelProvider = NonNullable<
  NonNullable<BotConfig["models"]>["providers"]
>[string];
const OPENAI_COMPATIBLE_EMBEDDING_PROVIDER_ID = "openai-compatible";
const OPENAI_COMPATIBLE_MODEL_APIS = new Set(["openai-completions", "openai-responses"]);

function resolveConfiguredProviderConfig(
  providerId: string,
  cfg?: BotConfig,
): ConfiguredModelProvider | undefined {
  const providers = cfg?.models?.providers;
  if (!providers) {
    return undefined;
  }
  const normalized = normalizeProviderId(providerId);
  return (
    providers[providerId] ??
    Object.entries(providers).find(
      ([candidateId]) => normalizeProviderId(candidateId) === normalized,
    )?.[1]
  );
}

/** Reads a configured provider's backing API id when runtime lookup should follow an alias. */
export function readConfiguredProviderApiId(params: {
  providerId: string;
  cfg?: BotConfig;
  resolveApiProviderId?: (normalizedApiId: string) => string | undefined;
  resolveMissingApiProviderId?: (providerConfig: ConfiguredModelProvider) => string | undefined;
}): string | undefined {
  const providerConfig = resolveConfiguredProviderConfig(params.providerId, params.cfg);
  if (!providerConfig) {
    return undefined;
  }
  const normalized = normalizeProviderId(params.providerId);
  const api = providerConfig.api?.trim();
  const resolvedProviderId = api
    ? (params.resolveApiProviderId?.(normalizeProviderId(api)) ?? normalizeProviderId(api))
    : params.resolveMissingApiProviderId?.(providerConfig);
  return resolvedProviderId && resolvedProviderId !== normalized ? resolvedProviderId : undefined;
}

export function resolveConfiguredGenericEmbeddingProviderId(
  providerId: string,
  cfg?: BotConfig,
): string | undefined {
  return readConfiguredProviderApiId({
    providerId,
    cfg,
    resolveApiProviderId: (normalizedApiId) =>
      OPENAI_COMPATIBLE_MODEL_APIS.has(normalizedApiId)
        ? OPENAI_COMPATIBLE_EMBEDDING_PROVIDER_ID
        : normalizedApiId,
    resolveMissingApiProviderId: (providerConfig) =>
      providerConfig.baseUrl?.trim() ? OPENAI_COMPATIBLE_EMBEDDING_PROVIDER_ID : undefined,
  });
}
