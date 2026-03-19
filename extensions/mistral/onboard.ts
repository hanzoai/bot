import {
  applyProviderConfigWithDefaultModelPreset,
  type HanzoBotConfig,
} from "openclaw/plugin-sdk/provider-onboard";
import {
  buildMistralModelDefinition,
  MISTRAL_BASE_URL,
  MISTRAL_DEFAULT_MODEL_ID,
} from "./model-definitions.js";

export const MISTRAL_DEFAULT_MODEL_REF = `mistral/${MISTRAL_DEFAULT_MODEL_ID}`;

function applyMistralPreset(cfg: HanzoBotConfig, primaryModelRef?: string): HanzoBotConfig {
  return applyProviderConfigWithDefaultModelPreset(cfg, {
    providerId: "mistral",
    api: "openai-completions",
    baseUrl: MISTRAL_BASE_URL,
    defaultModel: buildMistralModelDefinition(),
    defaultModelId: MISTRAL_DEFAULT_MODEL_ID,
    aliases: [{ modelRef: MISTRAL_DEFAULT_MODEL_REF, alias: "Mistral" }],
    primaryModelRef,
  });
}

export function applyMistralProviderConfig(cfg: HanzoBotConfig): HanzoBotConfig {
  return applyMistralPreset(cfg);
}

export function applyMistralConfig(cfg: HanzoBotConfig): HanzoBotConfig {
  return applyMistralPreset(cfg, MISTRAL_DEFAULT_MODEL_REF);
}
