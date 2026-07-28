import { normalizeOptionalString } from "@hanzo/bot-normalization-core/string-coerce";
import { resolveDefaultAgentId } from "../agents/agent-scope-config.js";
import type { BotConfig } from "../config/types.bot.js";
import { normalizeAgentId, resolveAgentIdFromSessionKey } from "../routing/session-key.js";

/** Resolves the configured owner for Talk work that has no agent-scoped session key. */
export function resolveTalkTargetAgentId(config: BotConfig): string {
  return normalizeAgentId(
    normalizeOptionalString(config.talk?.agentId) ?? resolveDefaultAgentId(config),
  );
}

/** Agent-scoped keys own their Talk session; legacy/unscoped aliases use the Talk target. */
export function resolveTalkSessionAgentId(
  config: BotConfig,
  sessionKey?: string | null,
): string {
  return resolveAgentIdFromSessionKey(sessionKey, resolveTalkTargetAgentId(config));
}
