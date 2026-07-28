import { DEFAULT_MODEL, DEFAULT_PROVIDER } from "../../../agents/defaults.js";
import { parseModelRef } from "../../../agents/model-selection-normalize.js";
import { resolveAgentModelPrimaryValue } from "../../../config/model-input.js";
import type { AgentModelConfig } from "../../../config/types.agents-shared.js";
import type { BotConfig } from "../../../config/types.bot.js";

export function resolveDoctorPrimaryModelRef(
  cfg: BotConfig,
  agentModel?: AgentModelConfig,
): { provider: string; model: string } {
  const raw =
    resolveAgentModelPrimaryValue(agentModel) ??
    resolveAgentModelPrimaryValue(cfg.agents?.defaults?.model) ??
    DEFAULT_MODEL;
  return (
    parseModelRef(raw, DEFAULT_PROVIDER, { allowPluginNormalization: false }) ?? {
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
    }
  );
}
