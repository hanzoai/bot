// Telegram plugin module implements bot native commands behavior.
export {
  ensureConfiguredBindingRouteReady,
  recordInboundSessionMetaSafe,
} from "bot/plugin-sdk/conversation-runtime";
export { getAgentScopedMediaLocalRoots } from "bot/plugin-sdk/media-runtime";
export {
  executePluginCommand,
  getPluginCommandSpecs,
  matchPluginCommand,
} from "bot/plugin-sdk/plugin-runtime";
export {
  finalizeInboundContext,
  resolveChunkMode,
} from "bot/plugin-sdk/reply-dispatch-runtime";
export { resolveThreadSessionKeys } from "bot/plugin-sdk/routing";
export { getSessionEntry } from "bot/plugin-sdk/session-store-runtime";
