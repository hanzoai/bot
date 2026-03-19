import { OPENCODE_ZEN_DEFAULT_MODEL_REF } from "openclaw/plugin-sdk/provider-models";
import {
  applyAgentDefaultModelPrimary,
  withAgentModelAliases,
  type Hanzo BotConfig,
} from "openclaw/plugin-sdk/provider-onboard";

export { OPENCODE_ZEN_DEFAULT_MODEL_REF };

export function applyOpencodeZenProviderConfig(cfg: Hanzo BotConfig): Hanzo BotConfig {
  return {
    ...cfg,
    agents: {
      ...cfg.agents,
      defaults: {
        ...cfg.agents?.defaults,
        models: withAgentModelAliases(cfg.agents?.defaults?.models, [
          { modelRef: OPENCODE_ZEN_DEFAULT_MODEL_REF, alias: "Opus" },
        ]),
      },
    },
  };
}

export function applyOpencodeZenConfig(cfg: Hanzo BotConfig): Hanzo BotConfig {
  return applyAgentDefaultModelPrimary(
    applyOpencodeZenProviderConfig(cfg),
    OPENCODE_ZEN_DEFAULT_MODEL_REF,
  );
}
