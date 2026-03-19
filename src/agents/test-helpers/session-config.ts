import type { HanzoBotConfig } from "../../config/config.js";

export function createPerSenderSessionConfig(
  overrides: Partial<NonNullable<HanzoBotConfig["session"]>> = {},
): NonNullable<HanzoBotConfig["session"]> {
  return {
    mainKey: "main",
    scope: "per-sender",
    ...overrides,
  };
}
