// Whatsapp plugin module implements group gating behavior.
export {
  implicitMentionKindWhen,
  resolveInboundMentionDecision,
} from "bot/plugin-sdk/channel-mention-gating";
export { hasControlCommand } from "bot/plugin-sdk/command-detection";
export { createChannelHistoryWindow } from "bot/plugin-sdk/reply-history";
export { parseActivationCommand } from "bot/plugin-sdk/group-activation";
export { normalizeE164 } from "../../text-runtime.js";
