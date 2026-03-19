import {
  applyProviderConfigWithDefaultModelPreset,
  type Hanzo BotConfig,
} from "openclaw/plugin-sdk/provider-onboard";
import {
  buildKimiCodingProvider,
  KIMI_CODING_BASE_URL,
  KIMI_CODING_DEFAULT_MODEL_ID,
} from "./provider-catalog.js";

export const KIMI_MODEL_REF = `kimi/${KIMI_CODING_DEFAULT_MODEL_ID}`;
export const KIMI_CODING_MODEL_REF = KIMI_MODEL_REF;

function resolveKimiCodingDefaultModel() {
  return buildKimiCodingProvider().models[0];
}

function applyKimiCodingPreset(cfg: Hanzo BotConfig, primaryModelRef?: string): Hanzo BotConfig {
  const defaultModel = resolveKimiCodingDefaultModel();
  if (!defaultModel) {
    return cfg;
  }
  return applyProviderConfigWithDefaultModelPreset(cfg, {
    providerId: "kimi",
    api: "anthropic-messages",
    baseUrl: KIMI_CODING_BASE_URL,
    defaultModel,
    defaultModelId: KIMI_CODING_DEFAULT_MODEL_ID,
    aliases: [{ modelRef: KIMI_MODEL_REF, alias: "Kimi" }],
    primaryModelRef,
  });
}

export function applyKimiCodeProviderConfig(cfg: Hanzo BotConfig): Hanzo BotConfig {
  return applyKimiCodingPreset(cfg);
}

export function applyKimiCodeConfig(cfg: Hanzo BotConfig): Hanzo BotConfig {
  return applyKimiCodingPreset(cfg, KIMI_MODEL_REF);
}
