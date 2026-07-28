// Whatsapp API module exposes the plugin public contract.
export { resolveIdentityNamePrefix } from "bot/plugin-sdk/agent-runtime";
export { formatInboundEnvelope } from "bot/plugin-sdk/channel-inbound";
export { resolveInboundSessionEnvelopeContext } from "bot/plugin-sdk/channel-inbound";
export { toLocationContext } from "bot/plugin-sdk/channel-inbound";
export {
  createChannelMessageReplyPipeline,
  resolveChannelMessageSourceReplyDeliveryMode,
} from "bot/plugin-sdk/channel-outbound";
export {
  isControlCommandMessage,
  shouldComputeCommandAuthorized,
} from "bot/plugin-sdk/command-detection";
export { resolveChannelContextVisibilityMode } from "../config.runtime.js";
export { getAgentScopedMediaLocalRoots } from "bot/plugin-sdk/media-runtime";
export type LoadConfigFn = typeof import("../config.runtime.js").getRuntimeConfig;
export {
  buildHistoryContextFromEntries,
  type HistoryEntry,
} from "bot/plugin-sdk/reply-history";
export { resolveSendableOutboundReplyParts } from "bot/plugin-sdk/reply-payload";
export {
  resolveChunkMode,
  resolveTextChunkLimit,
  type getReplyFromConfig,
  type ReplyPayload,
} from "bot/plugin-sdk/reply-runtime";
export {
  resolveInboundLastRouteSessionKey,
  type resolveAgentRoute,
} from "bot/plugin-sdk/routing";
export { logVerbose, shouldLogVerbose, type getChildLogger } from "bot/plugin-sdk/runtime-env";
export { resolvePinnedMainDmOwnerFromAllowlist } from "bot/plugin-sdk/security-runtime";
export { resolveMarkdownTableMode } from "bot/plugin-sdk/markdown-table-runtime";
export { jidToE164, normalizeE164 } from "../../text-runtime.js";
