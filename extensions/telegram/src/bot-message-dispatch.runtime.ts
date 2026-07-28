// Telegram plugin module implements bot message dispatch behavior.
export { getSessionEntry, type SessionEntry } from "bot/plugin-sdk/session-store-runtime";
export { resolveMarkdownTableMode } from "bot/plugin-sdk/markdown-table-runtime";
export { getAgentScopedMediaLocalRoots } from "bot/plugin-sdk/media-runtime";
export { resolveChunkMode } from "bot/plugin-sdk/reply-dispatch-runtime";
export {
  generateTelegramTopicLabel as generateTopicLabel,
  resolveAutoTopicLabelConfig,
} from "./auto-topic-label.js";
