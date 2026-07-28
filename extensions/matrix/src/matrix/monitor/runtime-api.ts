// Narrow Matrix monitor helper seam.
// Keep monitor internals off the broad package runtime-api barrel so monitor
// tests and shared workers do not pull unrelated Matrix helper surfaces.

export type { NormalizedLocation } from "bot/plugin-sdk/channel-inbound";
export type { PluginRuntime, RuntimeLogger } from "bot/plugin-sdk/plugin-runtime";
export type { BlockReplyContext, ReplyPayload } from "bot/plugin-sdk/reply-runtime";
export type { MarkdownTableMode, BotConfig } from "bot/plugin-sdk/config-contracts";
export type { RuntimeEnv } from "bot/plugin-sdk/runtime";
export {
  addAllowlistUserEntriesFromConfigEntry,
  buildAllowlistResolutionSummary,
  canonicalizeAllowlistWithResolvedIds,
  patchAllowlistUsersInConfigEntries,
  summarizeMapping,
} from "bot/plugin-sdk/allow-from";
export {
  createReplyPrefixOptions,
  createTypingCallbacks,
} from "bot/plugin-sdk/channel-outbound";
export { formatLocationText, toLocationContext } from "bot/plugin-sdk/channel-inbound";
export { getAgentScopedMediaLocalRoots } from "bot/plugin-sdk/media-local-roots";
export { logInboundDrop } from "bot/plugin-sdk/channel-inbound";
export { logTypingFailure } from "bot/plugin-sdk/channel-outbound";
export { buildChannelKeyCandidates } from "bot/plugin-sdk/channel-targets";
