import { readManifestProviderDefaultModelRef } from "bot/plugin-sdk/provider-catalog-shared";
import {
  createModelCatalogPresetAppliers,
  type BotConfig,
} from "bot/plugin-sdk/provider-onboard";
import { buildCohereCatalogModels, COHERE_BASE_URL } from "./models.js";
import manifest from "./bot.plugin.json" with { type: "json" };

const COHERE_DEFAULT_MODEL_REF = readManifestProviderDefaultModelRef(manifest, "cohere")!;

const coherePresetAppliers = createModelCatalogPresetAppliers({
  primaryModelRef: COHERE_DEFAULT_MODEL_REF,
  resolveParams: (_cfg: BotConfig) => ({
    providerId: "cohere",
    api: "openai-completions",
    baseUrl: COHERE_BASE_URL,
    catalogModels: buildCohereCatalogModels(),
    aliases: [{ modelRef: COHERE_DEFAULT_MODEL_REF, alias: "Cohere Command A+" }],
  }),
});

export function applyCohereConfig(cfg: BotConfig): BotConfig {
  return coherePresetAppliers.applyConfig(cfg);
}
