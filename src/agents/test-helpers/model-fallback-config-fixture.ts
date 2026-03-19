import type { Hanzo BotConfig } from "../../config/config.js";

export function makeModelFallbackCfg(overrides: Partial<Hanzo BotConfig> = {}): Hanzo BotConfig {
  return {
    agents: {
      defaults: {
        model: {
          primary: "openai/gpt-4.1-mini",
          fallbacks: ["anthropic/claude-haiku-3-5"],
        },
      },
    },
    ...overrides,
  } as Hanzo BotConfig;
}
