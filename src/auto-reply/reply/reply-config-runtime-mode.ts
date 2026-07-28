import type { BotConfig } from "../../config/types.bot.js";

// Reply completeness is process-local metadata. Keep it off config objects so
// frozen runtime snapshots and identity-keyed caches remain valid.
const replyConfigRuntimeModes = new WeakMap<BotConfig, "fast" | "full">();

export function markReplyConfigRuntimeMode<T extends BotConfig>(
  config: T,
  runtimeMode: "fast" | "full",
): T {
  replyConfigRuntimeModes.set(config, runtimeMode);
  return config;
}

export function isCompleteReplyConfig(config: unknown): config is BotConfig {
  return Boolean(
    config && typeof config === "object" && replyConfigRuntimeModes.has(config as BotConfig),
  );
}

export function usesFullReplyRuntime(config: unknown): boolean {
  return Boolean(
    config &&
    typeof config === "object" &&
    replyConfigRuntimeModes.get(config as BotConfig) === "full",
  );
}
