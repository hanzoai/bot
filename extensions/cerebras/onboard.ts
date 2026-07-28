import { readManifestProviderDefaultModelRef } from "bot/plugin-sdk/provider-catalog-shared";
import {
  createModelCatalogPresetAppliers,
  type BotConfig,
} from "bot/plugin-sdk/provider-onboard";
import { buildCerebrasCatalogModels, CEREBRAS_BASE_URL } from "./models.js";
import manifest from "./bot.plugin.json" with { type: "json" };

export const CEREBRAS_DEFAULT_MODEL_REF = readManifestProviderDefaultModelRef(
  manifest,
  "cerebras",
)!;

const cerebrasPresetAppliers = createModelCatalogPresetAppliers({
  primaryModelRef: CEREBRAS_DEFAULT_MODEL_REF,
  resolveParams: (_cfg: BotConfig) => ({
    providerId: "cerebras",
    api: "openai-completions",
    baseUrl: CEREBRAS_BASE_URL,
    catalogModels: buildCerebrasCatalogModels(),
    aliases: [{ modelRef: CEREBRAS_DEFAULT_MODEL_REF, alias: "Cerebras Gemma 4 31B" }],
  }),
});

export function applyCerebrasConfig(cfg: BotConfig): BotConfig {
  return cerebrasPresetAppliers.applyConfig(cfg);
}
