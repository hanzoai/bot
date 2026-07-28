// Deepinfra setup module handles plugin onboarding behavior.
import {
  applyAgentDefaultModelPrimary,
  type BotConfig,
} from "bot/plugin-sdk/provider-onboard";
import { DEEPINFRA_DEFAULT_MODEL_REF } from "./provider-models.js";

export function applyDeepInfraConfig(
  cfg: BotConfig,
  modelRef: string = DEEPINFRA_DEFAULT_MODEL_REF,
): BotConfig {
  const models = { ...cfg.agents?.defaults?.models };
  models[modelRef] = {
    ...models[modelRef],
    alias: models[modelRef]?.alias ?? "DeepInfra",
  };

  return applyAgentDefaultModelPrimary(
    {
      ...cfg,
      agents: {
        ...cfg.agents,
        defaults: {
          ...cfg.agents?.defaults,
          models,
        },
      },
    },
    modelRef,
  );
}
