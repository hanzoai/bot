// Telegram plugin module implements send behavior.
export { requireRuntimeConfig } from "bot/plugin-sdk/plugin-config-runtime";
export { resolveMarkdownTableMode } from "bot/plugin-sdk/markdown-table-runtime";
export type { BotConfig } from "bot/plugin-sdk/config-contracts";
export type { PollInput, MediaKind } from "bot/plugin-sdk/media-runtime";
export {
  buildOutboundMediaLoadOptions,
  getImageMetadata,
  isGifMedia,
  kindFromMime,
  normalizePollInput,
  probeVideoDimensions,
} from "bot/plugin-sdk/media-runtime";
export { loadWebMedia } from "bot/plugin-sdk/web-media";
