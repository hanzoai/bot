/** Baseten onboarding config helpers. */
import {
  createModelCatalogPresetAppliers,
  type BotConfig,
} from "bot/plugin-sdk/provider-onboard";
import { BASETEN_BASE_URL, BASETEN_DEFAULT_MODEL_REF, buildStaticBasetenModels } from "./models.js";

const basetenPresetAppliers = createModelCatalogPresetAppliers({
  primaryModelRef: BASETEN_DEFAULT_MODEL_REF,
  resolveParams: (_cfg: BotConfig) => ({
    providerId: "baseten",
    api: "openai-completions",
    baseUrl: BASETEN_BASE_URL,
    catalogModels: buildStaticBasetenModels(),
    aliases: [{ modelRef: BASETEN_DEFAULT_MODEL_REF, alias: "Inkling" }],
  }),
});

/** Applies Baseten's provider catalog, Inkling alias, and default model. */
export function applyBasetenConfig(cfg: BotConfig): BotConfig {
  return basetenPresetAppliers.applyConfig(cfg);
}
