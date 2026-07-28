import type { BotConfig } from "bot/plugin-sdk/config-contracts";

export function resolveZalouserDmSessionScope(config: BotConfig) {
  const configured = config.session?.dmScope;
  return configured === "main" || !configured ? "per-channel-peer" : configured;
}
