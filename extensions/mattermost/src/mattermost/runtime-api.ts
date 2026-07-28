// Mattermost API module exposes the plugin public contract.
export type {
  BaseProbeResult,
  ChannelAccountSnapshot,
  ChannelDirectoryEntry,
  ChatType,
  HistoryEntry,
  BotConfig,
  BotPluginApi,
  ReplyPayload,
} from "bot/plugin-sdk/core";
export type { RuntimeEnv } from "bot/plugin-sdk/runtime";
export { resolveAllowlistMatchSimple } from "bot/plugin-sdk/allow-from";
export { logInboundDrop } from "bot/plugin-sdk/channel-inbound";
export { createChannelPairingController } from "bot/plugin-sdk/channel-pairing";
export { createChannelMessageReplyPipeline } from "bot/plugin-sdk/channel-outbound";
export { logTypingFailure } from "bot/plugin-sdk/channel-feedback";
export { listSkillCommandsForAgents } from "bot/plugin-sdk/command-auth-native";
export { buildModelsProviderData } from "bot/plugin-sdk/models-provider-runtime";
export { isDangerousNameMatchingEnabled } from "bot/plugin-sdk/dangerous-name-runtime";
export {
  resolveAllowlistProviderRuntimeGroupPolicy,
  resolveDefaultGroupPolicy,
  warnMissingProviderGroupPolicyFallbackOnce,
} from "bot/plugin-sdk/runtime-group-policy";
export { resolveChannelMediaMaxBytes } from "bot/plugin-sdk/media-runtime";
export { loadOutboundMediaFromUrl } from "bot/plugin-sdk/outbound-media";
// Legacy map-helper exports stay for older plugin consumers. New message-turn
// code should use createChannelHistoryWindow.
export {
  DEFAULT_GROUP_HISTORY_LIMIT,
  createChannelHistoryWindow,
} from "bot/plugin-sdk/reply-history";
export { registerPluginHttpRoute } from "bot/plugin-sdk/webhook-targets";
export {
  isRequestBodyLimitError,
  readRequestBodyWithLimit,
} from "bot/plugin-sdk/webhook-ingress";
export { isTrustedProxyAddress, resolveClientIp } from "bot/plugin-sdk/core";
export { parseTcpPort } from "bot/plugin-sdk/number-runtime";
