import {
  createDefaultModelsPresetAppliers,
  type BotConfig,
} from "bot/plugin-sdk/provider-onboard";
import {
  buildFireworksCatalogModels,
  buildFireworksProvider,
  FIREWORKS_DEFAULT_MODEL_ID,
  FIREWORKS_DEFAULT_MODEL_REF,
} from "./provider-catalog.js";

const fireworksPresetAppliers = createDefaultModelsPresetAppliers({
  primaryModelRef: FIREWORKS_DEFAULT_MODEL_REF,
  resolveParams: (_cfg: BotConfig) => {
    const defaultProvider = buildFireworksProvider();
    return {
      providerId: "fireworks",
      api: defaultProvider.api ?? "openai-completions",
      baseUrl: defaultProvider.baseUrl,
      defaultModels: buildFireworksCatalogModels(),
      defaultModelId: FIREWORKS_DEFAULT_MODEL_ID,
      aliases: [{ modelRef: FIREWORKS_DEFAULT_MODEL_REF, alias: "GLM 5.2 Fast" }],
    };
  },
});

export function applyFireworksConfig(cfg: BotConfig): BotConfig {
  return fireworksPresetAppliers.applyConfig(cfg);
}
