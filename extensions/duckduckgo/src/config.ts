// Duckduckgo helper module supports config behavior.
import type { BotConfig } from "bot/plugin-sdk/config-contracts";
import { normalizeLowercaseStringOrEmpty } from "bot/plugin-sdk/string-coerce-runtime";

const DEFAULT_DDG_SAFE_SEARCH = "moderate";

export type DdgSafeSearch = "strict" | "moderate" | "off";

type DdgPluginConfig = {
  webSearch?: {
    region?: string;
    safeSearch?: string;
  };
};

function resolveDdgWebSearchConfig(
  config?: BotConfig,
): DdgPluginConfig["webSearch"] | undefined {
  const pluginConfig = config?.plugins?.entries?.duckduckgo?.config as DdgPluginConfig | undefined;
  const webSearch = pluginConfig?.webSearch;
  if (webSearch && typeof webSearch === "object" && !Array.isArray(webSearch)) {
    return webSearch;
  }
  return undefined;
}

export function resolveDdgRegion(config?: BotConfig): string | undefined {
  const region = resolveDdgWebSearchConfig(config)?.region;
  if (typeof region !== "string") {
    return undefined;
  }
  const trimmed = region.trim();
  return trimmed || undefined;
}

export function resolveDdgSafeSearch(config?: BotConfig): DdgSafeSearch {
  const safeSearch = resolveDdgWebSearchConfig(config)?.safeSearch;
  const normalized = normalizeLowercaseStringOrEmpty(safeSearch);
  if (normalized === "strict" || normalized === "off") {
    return normalized;
  }
  return DEFAULT_DDG_SAFE_SEARCH;
}
