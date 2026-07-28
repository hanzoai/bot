// Private runtime barrel for the bundled Microsoft Teams extension.
// Keep this barrel thin and aligned with the local extension surface.

export { DEFAULT_ACCOUNT_ID } from "bot/plugin-sdk/account-id";
export type { AllowlistMatch } from "bot/plugin-sdk/allow-from";
export {
  mergeAllowlist,
  resolveAllowlistMatchSimple,
  summarizeMapping,
} from "bot/plugin-sdk/allow-from";
export type {
  BaseProbeResult,
  ChannelDirectoryEntry,
  ChannelGroupContext,
  ChannelMessageActionName,
  ChannelOutboundAdapter,
} from "bot/plugin-sdk/channel-contract";
export type { ChannelPlugin } from "bot/plugin-sdk/channel-core";
export { logTypingFailure } from "bot/plugin-sdk/channel-outbound";
export { createChannelPairingController } from "bot/plugin-sdk/channel-pairing";
export { resolveToolsBySender } from "bot/plugin-sdk/channel-policy";
export { createChannelMessageReplyPipeline } from "bot/plugin-sdk/channel-outbound";
export {
  PAIRING_APPROVED_MESSAGE,
  buildProbeChannelStatusSummary,
  createDefaultChannelRuntimeState,
} from "bot/plugin-sdk/channel-status";
export {
  buildChannelKeyCandidates,
  normalizeChannelSlug,
  resolveChannelEntryMatchWithFallback,
  resolveNestedAllowlistDecision,
} from "bot/plugin-sdk/channel-targets";
export type {
  GroupPolicy,
  GroupToolPolicyConfig,
  MSTeamsChannelConfig,
  MSTeamsCloudName,
  MSTeamsConfig,
  MSTeamsReplyStyle,
  MSTeamsTeamConfig,
  MarkdownTableMode,
  BotConfig,
} from "bot/plugin-sdk/config-contracts";
export { isDangerousNameMatchingEnabled } from "bot/plugin-sdk/dangerous-name-runtime";
export { resolveDefaultGroupPolicy } from "bot/plugin-sdk/runtime-group-policy";
export { withFileLock } from "bot/plugin-sdk/file-lock";
export { keepHttpServerTaskAlive } from "bot/plugin-sdk/channel-outbound";
export {
  detectMime,
  extensionForMime,
  extractOriginalFilename,
  getFileExtension,
  resolveChannelMediaMaxBytes,
} from "bot/plugin-sdk/media-runtime";
export { loadOutboundMediaFromUrl } from "bot/plugin-sdk/outbound-media";
// Deprecated media-legacy-projection surface; the re-export stays until the
// compat record's removeAfter window expires (deleted in retirement PR 4).
export { buildMediaPayload } from "bot/plugin-sdk/reply-payload";
export type { ReplyPayload } from "bot/plugin-sdk/reply-payload";
export type { PluginRuntime } from "bot/plugin-sdk/runtime-store";
export type { RuntimeEnv } from "bot/plugin-sdk/runtime";
export type { SsrFPolicy } from "bot/plugin-sdk/ssrf-runtime";
export { fetchWithSsrFGuard } from "bot/plugin-sdk/ssrf-runtime";
export { normalizeStringEntries } from "bot/plugin-sdk/string-normalization-runtime";
export { chunkTextForOutbound } from "bot/plugin-sdk/text-chunking";
export { DEFAULT_WEBHOOK_MAX_BODY_BYTES } from "bot/plugin-sdk/webhook-ingress";
export { setMSTeamsRuntime } from "./src/runtime.js";
