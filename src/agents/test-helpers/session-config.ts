import type { Hanzo BotConfig } from "../../config/config.js";

export function createPerSenderSessionConfig(
  overrides: Partial<NonNullable<Hanzo BotConfig["session"]>> = {},
): NonNullable<Hanzo BotConfig["session"]> {
  return {
    mainKey: "main",
    scope: "per-sender",
    ...overrides,
  };
}
