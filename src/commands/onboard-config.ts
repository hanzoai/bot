import type { BotConfig } from "../config/config.js";

export function applyOnboardingLocalWorkspaceConfig(
  baseConfig: BotConfig,
  workspaceDir: string,
): BotConfig {
  return {
    ...baseConfig,
    agents: {
      ...baseConfig.agents,
      defaults: {
        ...baseConfig.agents?.defaults,
        workspace: workspaceDir,
      },
    },
    gateway: {
      ...baseConfig.gateway,
      mode: "local",
    },
  };
}
