// Whatsapp plugin module implements ack emoji behavior.
import { resolveAgentIdentity } from "bot/plugin-sdk/agent-runtime";
import type { BotConfig } from "bot/plugin-sdk/config-contracts";

const DEFAULT_WHATSAPP_ACK_REACTION = "👀";

export function resolveWhatsAppAckEmoji(params: {
  cfg: BotConfig;
  agentId: string;
  ackConfig: string | { emoji?: string } | undefined;
}): string {
  if (!params.ackConfig) {
    return "";
  }
  const configured =
    typeof params.ackConfig === "string" ? params.ackConfig : params.ackConfig.emoji;
  return (
    configured?.trim() ||
    resolveAgentIdentityEmoji(params.cfg, params.agentId) ||
    DEFAULT_WHATSAPP_ACK_REACTION
  );
}

function resolveAgentIdentityEmoji(cfg: BotConfig, agentId: string): string | undefined {
  const emoji = resolveAgentIdentity(cfg, agentId)?.emoji?.trim();
  return emoji || undefined;
}
