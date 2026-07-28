// Moonshot setup module handles plugin onboarding behavior.
import {
  createDefaultModelPresetAppliers,
  type BotConfig,
} from "bot/plugin-sdk/provider-onboard";
import {
  buildMoonshotProvider,
  MOONSHOT_BASE_URL,
  MOONSHOT_CN_BASE_URL,
  MOONSHOT_DEFAULT_MODEL_ID,
  MOONSHOT_DEFAULT_MODEL_REF,
} from "./provider-catalog.js";

const moonshotPresetAppliers = createDefaultModelPresetAppliers<[string]>({
  primaryModelRef: MOONSHOT_DEFAULT_MODEL_REF,
  resolveParams: (_cfg: BotConfig, baseUrl: string) => {
    const defaultModel = buildMoonshotProvider().models.find(
      (model) => model.id === MOONSHOT_DEFAULT_MODEL_ID,
    );
    if (!defaultModel) {
      return null;
    }

    return {
      providerId: "moonshot",
      api: "openai-completions",
      baseUrl,
      defaultModel,
      defaultModelId: MOONSHOT_DEFAULT_MODEL_ID,
      aliases: [{ modelRef: MOONSHOT_DEFAULT_MODEL_REF, alias: "Kimi" }],
    };
  },
});

export function applyMoonshotConfig(cfg: BotConfig): BotConfig {
  return moonshotPresetAppliers.applyConfig(cfg, MOONSHOT_BASE_URL);
}

export function applyMoonshotConfigCn(cfg: BotConfig): BotConfig {
  return moonshotPresetAppliers.applyConfig(cfg, MOONSHOT_CN_BASE_URL);
}
