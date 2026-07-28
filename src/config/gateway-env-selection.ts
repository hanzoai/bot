import { collectConfigRuntimeEnvVars } from "./env-vars.js";
import type { BotConfig } from "./types.js";

export const GATEWAY_CONFIG_SELECTION_ENV_KEYS: ReadonlySet<string> = new Set([
  "ANDROID_DATA",
  "HOME",
  "HOMEDRIVE",
  "HOMEPATH",
  "BOT_AGENT_DIR",
  "BOT_CONFIG_PATH",
  "BOT_HOME",
  "BOT_INCLUDE_ROOTS",
  "BOT_NIX_MODE",
  "BOT_OAUTH_DIR",
  "BOT_PACKAGE_DIR",
  "BOT_PROFILE",
  "BOT_STATE_DIR",
  "BOT_WORKSPACE_DIR",
  "PI_CODING_AGENT_DIR",
  "PREFIX",
  "USERPROFILE",
]);

/** Rejects config.env changes that would retarget a running Gateway process. */
export function assertGatewayConfigEnvSelectionUnchanged(
  previousConfig: BotConfig,
  nextConfig: BotConfig,
): void {
  const normalize = (config: BotConfig) =>
    new Map(
      Object.entries(collectConfigRuntimeEnvVars(config)).map(([key, value]) => [
        key.toUpperCase(),
        value,
      ]),
    );
  const previous = normalize(previousConfig);
  const next = normalize(nextConfig);
  for (const key of GATEWAY_CONFIG_SELECTION_ENV_KEYS) {
    if (previous.get(key) !== next.get(key)) {
      throw new Error(
        `Config env cannot change process-stable Gateway selector ${key} during reload. Restart with the target environment instead.`,
      );
    }
  }
}
