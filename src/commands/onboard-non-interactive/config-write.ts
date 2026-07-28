import type { BotConfig } from "../../config/types.bot.js";

/** Commits a non-interactive onboard config update with pending plugin records handled first. */
export async function commitNonInteractiveOnboardConfig(params: {
  nextConfig: BotConfig;
  baseConfig: BotConfig;
  baseHash?: string;
  reset?: boolean;
}): Promise<BotConfig> {
  const { writeWizardConfigFile } = await import("../../wizard/setup.shared.js");
  // Ordinary onboard reruns must preserve existing agents.list / bindings.
  // Only explicit --reset may allow a config size drop; see bot#84692.
  return await writeWizardConfigFile(params.nextConfig, {
    allowConfigSizeDrop: params.reset === true,
    ...(params.baseHash !== undefined ? { baseHash: params.baseHash } : {}),
    migrationBaseConfig: params.baseConfig,
  });
}
