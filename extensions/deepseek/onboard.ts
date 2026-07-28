import { readManifestProviderDefaultModelRef } from "bot/plugin-sdk/provider-catalog-shared";
import {
  createModelCatalogPresetAppliers,
  type BotConfig,
} from "bot/plugin-sdk/provider-onboard";
import { DEEPSEEK_BASE_URL, DEEPSEEK_MODEL_CATALOG } from "./models.js";
import manifest from "./bot.plugin.json" with { type: "json" };

const DEEPSEEK_DEFAULT_MODEL_REF = readManifestProviderDefaultModelRef(manifest, "deepseek")!;

const deepSeekPresetAppliers = createModelCatalogPresetAppliers({
  primaryModelRef: DEEPSEEK_DEFAULT_MODEL_REF,
  resolveParams: (_cfg: BotConfig) => ({
    providerId: "deepseek",
    api: "openai-completions",
    baseUrl: DEEPSEEK_BASE_URL,
    catalogModels: structuredClone(DEEPSEEK_MODEL_CATALOG),
    aliases: [{ modelRef: DEEPSEEK_DEFAULT_MODEL_REF, alias: "DeepSeek" }],
  }),
});

export function applyDeepSeekConfig(cfg: BotConfig): BotConfig {
  return deepSeekPresetAppliers.applyConfig(cfg);
}
