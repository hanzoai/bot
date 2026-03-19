import { KILOCODE_BASE_URL, KILOCODE_DEFAULT_MODEL_REF } from "openclaw/plugin-sdk/provider-models";
import {
  applyProviderConfigWithModelCatalogPreset,
  type Hanzo BotConfig,
} from "openclaw/plugin-sdk/provider-onboard";
import { buildKilocodeProvider } from "./provider-catalog.js";

export { KILOCODE_BASE_URL, KILOCODE_DEFAULT_MODEL_REF };

export function applyKilocodeProviderConfig(cfg: Hanzo BotConfig): Hanzo BotConfig {
  return applyProviderConfigWithModelCatalogPreset(cfg, {
    providerId: "kilocode",
    api: "openai-completions",
    baseUrl: KILOCODE_BASE_URL,
    catalogModels: buildKilocodeProvider().models ?? [],
    aliases: [{ modelRef: KILOCODE_DEFAULT_MODEL_REF, alias: "Kilo Gateway" }],
  });
}

export function applyKilocodeConfig(cfg: Hanzo BotConfig): Hanzo BotConfig {
  return applyProviderConfigWithModelCatalogPreset(cfg, {
    providerId: "kilocode",
    api: "openai-completions",
    baseUrl: KILOCODE_BASE_URL,
    catalogModels: buildKilocodeProvider().models ?? [],
    aliases: [{ modelRef: KILOCODE_DEFAULT_MODEL_REF, alias: "Kilo Gateway" }],
    primaryModelRef: KILOCODE_DEFAULT_MODEL_REF,
  });
}
