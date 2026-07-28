// Private runtime barrel for the bundled Mattermost extension.
// Keep this barrel thin and generic-only.

export type {
  BaseProbeResult,
  ChannelAccountSnapshot,
  ChannelDirectoryEntry,
  ChannelGroupContext,
  ChannelMessageActionName,
  ChannelPlugin,
  ChatType,
  HistoryEntry,
  BotConfig,
  BotPluginApi,
  PluginRuntime,
} from "bot/plugin-sdk/core";
export type { RuntimeEnv } from "bot/plugin-sdk/runtime";
export type { ReplyPayload } from "bot/plugin-sdk/reply-runtime";
export type { ModelsProviderData } from "bot/plugin-sdk/models-provider-runtime";
export type {
  BlockStreamingCoalesceConfig,
  DmPolicy,
  GroupPolicy,
} from "bot/plugin-sdk/config-contracts";
export {
  DEFAULT_ACCOUNT_ID,
  buildChannelConfigSchema,
  createDedupeCache,
  parseStrictPositiveInteger,
  resolveClientIp,
  isTrustedProxyAddress,
} from "bot/plugin-sdk/core";
export { buildComputedAccountStatusSnapshot } from "bot/plugin-sdk/channel-status";
export { createAccountStatusSink } from "bot/plugin-sdk/channel-outbound";
export {
  listSkillCommandsForAgents,
  resolveControlCommandGate,
  resolveStoredModelOverride,
} from "bot/plugin-sdk/command-auth-native";
export { buildModelsProviderData } from "bot/plugin-sdk/models-provider-runtime";
export {
  GROUP_POLICY_BLOCKED_LABEL,
  resolveAllowlistProviderRuntimeGroupPolicy,
  resolveDefaultGroupPolicy,
  warnMissingProviderGroupPolicyFallbackOnce,
} from "bot/plugin-sdk/runtime-group-policy";
export { isDangerousNameMatchingEnabled } from "bot/plugin-sdk/dangerous-name-runtime";
export { resolveStorePath } from "bot/plugin-sdk/session-store-runtime";
export { formatInboundFromLabel } from "bot/plugin-sdk/channel-inbound";
export { logInboundDrop } from "bot/plugin-sdk/channel-inbound";
export { createChannelPairingController } from "bot/plugin-sdk/channel-pairing";
export { createChannelMessageReplyPipeline } from "bot/plugin-sdk/channel-outbound";
export { logTypingFailure } from "bot/plugin-sdk/channel-feedback";
export { loadOutboundMediaFromUrl } from "bot/plugin-sdk/outbound-media";
export { rawDataToString } from "bot/plugin-sdk/webhook-ingress";
export { chunkTextForOutbound } from "bot/plugin-sdk/text-chunking";
// Legacy map-helper exports stay for older plugin consumers. New message-turn
// code should use createChannelHistoryWindow.
export {
  DEFAULT_GROUP_HISTORY_LIMIT,
  createChannelHistoryWindow,
  buildPendingHistoryContextFromMap,
  clearHistoryEntriesIfEnabled,
  recordPendingHistoryEntryIfEnabled,
} from "bot/plugin-sdk/reply-history";
export { normalizeAccountId, resolveThreadSessionKeys } from "bot/plugin-sdk/routing";
export { resolveAllowlistMatchSimple } from "bot/plugin-sdk/allow-from";
export { registerPluginHttpRoute } from "bot/plugin-sdk/webhook-targets";
export {
  isRequestBodyLimitError,
  readRequestBodyWithLimit,
} from "bot/plugin-sdk/webhook-ingress";
export {
  applyAccountNameToChannelSection,
  applySetupAccountConfigPatch,
  migrateBaseNameToDefaultAccount,
} from "bot/plugin-sdk/setup";
export {
  getAgentScopedMediaLocalRoots,
  resolveChannelMediaMaxBytes,
} from "bot/plugin-sdk/media-runtime";
export { normalizeProviderId } from "bot/plugin-sdk/provider-model-shared";
export { setMattermostRuntime } from "./src/runtime.js";
