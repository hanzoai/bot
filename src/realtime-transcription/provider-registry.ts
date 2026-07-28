// Realtime transcription provider registry stores transcription provider factories.
import type { BotConfig } from "../config/types.bot.js";
import {
  resolvePluginCapabilityProvider,
  resolvePluginCapabilityProviders,
} from "../plugins/capability-provider-runtime.js";
import {
  buildCapabilityProviderMaps,
  normalizeCapabilityProviderId,
} from "../plugins/provider-registry-shared.js";
import type { RealtimeTranscriptionProviderPlugin } from "../plugins/types.js";
import type { RealtimeTranscriptionProviderId } from "./provider-types.js";

// Provider registry helpers for realtime transcription. Plugin ids and aliases
// share the generic capability-provider registry machinery.
export function normalizeRealtimeTranscriptionProviderId(
  providerId: string | undefined,
): RealtimeTranscriptionProviderId | undefined {
  return normalizeCapabilityProviderId(providerId);
}

function resolveRealtimeTranscriptionProviderEntries(
  cfg?: BotConfig,
): RealtimeTranscriptionProviderPlugin[] {
  return resolvePluginCapabilityProviders({
    key: "realtimeTranscriptionProviders",
    cfg,
  });
}

function buildProviderMaps(cfg?: BotConfig): {
  canonical: Map<string, RealtimeTranscriptionProviderPlugin>;
  aliases: Map<string, RealtimeTranscriptionProviderPlugin>;
} {
  return buildCapabilityProviderMaps(resolveRealtimeTranscriptionProviderEntries(cfg));
}

/** Lists canonical realtime transcription providers for the active config. */
export function listRealtimeTranscriptionProviders(
  cfg?: BotConfig,
): RealtimeTranscriptionProviderPlugin[] {
  return [...buildProviderMaps(cfg).canonical.values()];
}

/** Resolves a realtime transcription provider by id or alias. */
export function getRealtimeTranscriptionProvider(
  providerId: string | undefined,
  cfg?: BotConfig,
): RealtimeTranscriptionProviderPlugin | undefined {
  const normalized = normalizeRealtimeTranscriptionProviderId(providerId);
  if (!normalized) {
    return undefined;
  }
  return resolvePluginCapabilityProvider({
    key: "realtimeTranscriptionProviders",
    providerId: normalized,
    cfg,
  });
}

/** Canonicalizes a configured provider id while preserving unknown ids. */
export function canonicalizeRealtimeTranscriptionProviderId(
  providerId: string | undefined,
  cfg?: BotConfig,
): RealtimeTranscriptionProviderId | undefined {
  const normalized = normalizeRealtimeTranscriptionProviderId(providerId);
  if (!normalized) {
    return undefined;
  }
  return getRealtimeTranscriptionProvider(normalized, cfg)?.id ?? normalized;
}
