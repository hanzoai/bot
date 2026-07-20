import type { BotConfig } from "../config/config.js";

export function shouldRequireGatewayTokenForInstall(
  cfg: BotConfig,
  _env: NodeJS.ProcessEnv,
): boolean {
  const mode = cfg.gateway?.auth?.mode;
  if (mode === "token") {
    return true;
  }
  if (mode === "none" || mode === "trusted-proxy") {
    return false;
  }
  return true;
}
