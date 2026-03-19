import {
  buildHuggingfaceModelDefinition,
  HUGGINGFACE_BASE_URL,
  HUGGINGFACE_MODEL_CATALOG,
} from "openclaw/plugin-sdk/provider-models";
import {
  applyProviderConfigWithModelCatalogPreset,
  type HanzoBotConfig,
} from "openclaw/plugin-sdk/provider-onboard";

export const HUGGINGFACE_DEFAULT_MODEL_REF = "huggingface/deepseek-ai/DeepSeek-R1";

function applyHuggingfacePreset(cfg: HanzoBotConfig, primaryModelRef?: string): HanzoBotConfig {
  return applyProviderConfigWithModelCatalogPreset(cfg, {
    providerId: "huggingface",
    api: "openai-completions",
    baseUrl: HUGGINGFACE_BASE_URL,
    catalogModels: HUGGINGFACE_MODEL_CATALOG.map(buildHuggingfaceModelDefinition),
    aliases: [{ modelRef: HUGGINGFACE_DEFAULT_MODEL_REF, alias: "Hugging Face" }],
    primaryModelRef,
  });
}

export function applyHuggingfaceProviderConfig(cfg: HanzoBotConfig): HanzoBotConfig {
  return applyHuggingfacePreset(cfg);
}

export function applyHuggingfaceConfig(cfg: HanzoBotConfig): HanzoBotConfig {
  return applyHuggingfacePreset(cfg, HUGGINGFACE_DEFAULT_MODEL_REF);
}
