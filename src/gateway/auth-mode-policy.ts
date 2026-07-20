import type { BotConfig } from "../config/config.js";

export const EXPLICIT_GATEWAY_AUTH_MODE_REQUIRED_ERROR =
  "Invalid config: gateway.auth.token and gateway.auth.password are both configured, but gateway.auth.mode is unset. Set gateway.auth.mode to token or password.";

export function hasAmbiguousGatewayAuthModeConfig(cfg: BotConfig): boolean {
  const auth = cfg.gateway?.auth;
  if (!auth) {
    return false;
  }
  if (typeof auth.mode === "string" && auth.mode.trim().length > 0) {
    return false;
  }
  // Token is the only shared-secret auth mode, so two configured secrets can
  // never collide and an explicit mode is never required to disambiguate.
  return false;
}

export function assertExplicitGatewayAuthModeWhenBothConfigured(cfg: BotConfig): void {
  if (!hasAmbiguousGatewayAuthModeConfig(cfg)) {
    return;
  }
  throw new Error(EXPLICIT_GATEWAY_AUTH_MODE_REQUIRED_ERROR);
}
