import {
  applyProviderConfigWithDefaultModelPreset,
  type Hanzo BotConfig,
} from "openclaw/plugin-sdk/provider-onboard";
import {
  buildMoonshotProvider,
  MOONSHOT_BASE_URL,
  MOONSHOT_DEFAULT_MODEL_ID,
} from "./provider-catalog.js";

export const MOONSHOT_CN_BASE_URL = "https://api.moonshot.cn/v1";
export const MOONSHOT_DEFAULT_MODEL_REF = `moonshot/${MOONSHOT_DEFAULT_MODEL_ID}`;

export function applyMoonshotProviderConfig(cfg: Hanzo BotConfig): Hanzo BotConfig {
  return applyMoonshotProviderConfigWithBaseUrl(cfg, MOONSHOT_BASE_URL);
}

export function applyMoonshotProviderConfigCn(cfg: Hanzo BotConfig): Hanzo BotConfig {
  return applyMoonshotProviderConfigWithBaseUrl(cfg, MOONSHOT_CN_BASE_URL);
}

function applyMoonshotProviderConfigWithBaseUrl(
  cfg: Hanzo BotConfig,
  baseUrl: string,
  primaryModelRef?: string,
): Hanzo BotConfig {
  const defaultModel = buildMoonshotProvider().models[0];
  if (!defaultModel) {
    return cfg;
  }

  return applyProviderConfigWithDefaultModelPreset(cfg, {
    providerId: "moonshot",
    api: "openai-completions",
    baseUrl,
    defaultModel,
    defaultModelId: MOONSHOT_DEFAULT_MODEL_ID,
    aliases: [{ modelRef: MOONSHOT_DEFAULT_MODEL_REF, alias: "Kimi" }],
    primaryModelRef,
  });
}

export function applyMoonshotConfig(cfg: Hanzo BotConfig): Hanzo BotConfig {
  return applyMoonshotProviderConfigWithBaseUrl(cfg, MOONSHOT_BASE_URL, MOONSHOT_DEFAULT_MODEL_REF);
}

export function applyMoonshotConfigCn(cfg: Hanzo BotConfig): Hanzo BotConfig {
  return applyMoonshotProviderConfigWithBaseUrl(
    cfg,
    MOONSHOT_CN_BASE_URL,
    MOONSHOT_DEFAULT_MODEL_REF,
  );
}
