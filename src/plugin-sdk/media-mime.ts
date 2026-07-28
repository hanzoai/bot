// Narrow media MIME helper surface for plugins that do not need the full media runtime.

export {
  detectMime,
  extensionForMime,
  getFileExtension,
  mimeTypeFromFilePath,
  normalizeMimeType,
} from "@hanzo/bot-media-core/mime";
export { mediaKindFromMime, type MediaKind } from "@hanzo/bot-media-core/constants";
