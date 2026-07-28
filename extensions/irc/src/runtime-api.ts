// Private runtime barrel for the bundled IRC extension.
// Keep this barrel thin and generic-only.

export type { BaseProbeResult } from "bot/plugin-sdk/channel-contract";
export type { ChannelPlugin } from "bot/plugin-sdk/channel-core";
export type { BotConfig } from "bot/plugin-sdk/config-contracts";
export type { PluginRuntime } from "bot/plugin-sdk/runtime-store";
export type { RuntimeEnv } from "bot/plugin-sdk/runtime";
export type {
  BlockStreamingCoalesceConfig,
  DmConfig,
  DmPolicy,
  GroupPolicy,
  GroupToolPolicyBySenderConfig,
  GroupToolPolicyConfig,
  MarkdownConfig,
} from "bot/plugin-sdk/config-contracts";
export type { OutboundReplyPayload } from "bot/plugin-sdk/reply-payload";
export { DEFAULT_ACCOUNT_ID } from "bot/plugin-sdk/account-id";
export { buildChannelConfigSchema } from "bot/plugin-sdk/channel-config-schema";
export {
  PAIRING_APPROVED_MESSAGE,
  buildBaseChannelStatusSummary,
} from "bot/plugin-sdk/channel-status";
export { createChannelPairingController } from "bot/plugin-sdk/channel-pairing";
export { createAccountStatusSink } from "bot/plugin-sdk/channel-outbound";
export { resolveControlCommandGate } from "bot/plugin-sdk/command-auth-native";
export { createChannelMessageReplyPipeline } from "bot/plugin-sdk/channel-outbound";
export { chunkTextForOutbound } from "bot/plugin-sdk/text-chunking";
export {
  deliverFormattedTextWithAttachments,
  formatTextWithAttachmentLinks,
  resolveOutboundMediaUrls,
} from "bot/plugin-sdk/reply-payload";
export {
  GROUP_POLICY_BLOCKED_LABEL,
  resolveAllowlistProviderRuntimeGroupPolicy,
  resolveDefaultGroupPolicy,
  warnMissingProviderGroupPolicyFallbackOnce,
} from "bot/plugin-sdk/runtime-group-policy";
export { isDangerousNameMatchingEnabled } from "bot/plugin-sdk/dangerous-name-runtime";
export { logInboundDrop } from "bot/plugin-sdk/channel-inbound";
