/**
 * Browser-local SDK setup/tooling bridge for CLI, media, and action helpers.
 */
export {
  callGatewayTool,
  listNodes,
  resolveNodeIdFromList,
  selectDefaultNodeFromList,
} from "bot/plugin-sdk/agent-harness-runtime";
export type { AnyAgentTool, NodeListNode } from "bot/plugin-sdk/agent-harness-runtime";
export {
  imageResultFromFile,
  jsonResult,
  readPositiveIntegerParam,
  readStringParam,
} from "bot/plugin-sdk/channel-actions";
export {
  formatCliCommand,
  formatHelpExamples,
  inheritOptionFromParent,
  note,
  theme,
} from "bot/plugin-sdk/cli-runtime";
export { danger, info } from "bot/plugin-sdk/runtime-env";
export {
  IMAGE_REDUCE_QUALITY_STEPS,
  buildImageResizeSideGrid,
  getImageMetadata,
  isImageProcessorUnavailableError,
  resizeToJpeg,
} from "bot/plugin-sdk/media-runtime";
export { detectMime } from "bot/plugin-sdk/media-mime";
export { ensureMediaDir, saveMediaBuffer } from "bot/plugin-sdk/media-runtime";
export { describeImageFile } from "bot/plugin-sdk/media-understanding-runtime";
export { formatDocsLink } from "bot/plugin-sdk/setup-tools";
export {
  completeWithPreparedSimpleCompletionModel,
  extractAssistantText,
  prepareSimpleCompletionModelForAgent,
} from "bot/plugin-sdk/simple-completion-runtime";
export { validateJsonSchemaValue } from "bot/plugin-sdk/json-schema-runtime";
export {
  htmlToMarkdown,
  normalizeWhitespace,
  sanitizeHtml,
} from "bot/plugin-sdk/web-content-extractor";
