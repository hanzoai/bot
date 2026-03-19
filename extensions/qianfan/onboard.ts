import {
  applyProviderConfigWithDefaultModelsPreset,
  type ModelApi,
  type Hanzo BotConfig,
} from "openclaw/plugin-sdk/provider-onboard";
import {
  buildQianfanProvider,
  QIANFAN_BASE_URL,
  QIANFAN_DEFAULT_MODEL_ID,
} from "./provider-catalog.js";

export const QIANFAN_DEFAULT_MODEL_REF = `qianfan/${QIANFAN_DEFAULT_MODEL_ID}`;

function resolveQianfanPreset(cfg: Hanzo BotConfig): {
  api: ModelApi;
  baseUrl: string;
  defaultModels: NonNullable<ReturnType<typeof buildQianfanProvider>["models"]>;
} {
  const defaultProvider = buildQianfanProvider();
  const existingProvider = cfg.models?.providers?.qianfan as
    | {
        baseUrl?: unknown;
        api?: unknown;
      }
    | undefined;
  const existingBaseUrl =
    typeof existingProvider?.baseUrl === "string" ? existingProvider.baseUrl.trim() : "";
  const api =
    typeof existingProvider?.api === "string"
      ? (existingProvider.api as ModelApi)
      : "openai-completions";

  return {
    api,
    baseUrl: existingBaseUrl || QIANFAN_BASE_URL,
    defaultModels: defaultProvider.models ?? [],
  };
}

function applyQianfanPreset(cfg: Hanzo BotConfig, primaryModelRef?: string): Hanzo BotConfig {
  const preset = resolveQianfanPreset(cfg);
  return applyProviderConfigWithDefaultModelsPreset(cfg, {
    providerId: "qianfan",
    api: preset.api,
    baseUrl: preset.baseUrl,
    defaultModels: preset.defaultModels,
    defaultModelId: QIANFAN_DEFAULT_MODEL_ID,
    aliases: [{ modelRef: QIANFAN_DEFAULT_MODEL_REF, alias: "QIANFAN" }],
    primaryModelRef,
  });
}

export function applyQianfanProviderConfig(cfg: Hanzo BotConfig): Hanzo BotConfig {
  return applyQianfanPreset(cfg);
}

export function applyQianfanConfig(cfg: Hanzo BotConfig): Hanzo BotConfig {
  return applyQianfanPreset(cfg, QIANFAN_DEFAULT_MODEL_REF);
}
