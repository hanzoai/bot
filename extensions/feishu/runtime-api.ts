// Private runtime barrel for the bundled Feishu extension.
// Keep this barrel thin and generic-only.

export type {
  AllowlistMatch,
  AnyAgentTool,
  BaseProbeResult,
  ChannelGroupContext,
  ChannelMessageActionName,
  ChannelMeta,
  ChannelOutboundAdapter,
  ChannelPlugin,
  HistoryEntry,
  BotConfig,
  BotPluginApi,
  OutboundIdentity,
  PluginRuntime,
  ReplyPayload,
} from "bot/plugin-sdk/core";
export type { BotConfig as BotConfig } from "bot/plugin-sdk/core";
export type RuntimeEnv = {
  log: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  exit: (code: number) => void;
};
export type { GroupToolPolicyConfig } from "bot/plugin-sdk/config-contracts";
export {
  DEFAULT_ACCOUNT_ID,
  buildChannelConfigSchema,
  createActionGate,
  createDedupeCache,
} from "bot/plugin-sdk/core";
export {
  PAIRING_APPROVED_MESSAGE,
  buildProbeChannelStatusSummary,
  createDefaultChannelRuntimeState,
} from "bot/plugin-sdk/channel-status";
export { createChannelPairingController } from "bot/plugin-sdk/channel-pairing";
export { createReplyPrefixContext } from "bot/plugin-sdk/channel-outbound";
export {
  evaluateSupplementalContextVisibility,
  filterSupplementalContextItems,
  resolveChannelContextVisibilityMode,
} from "bot/plugin-sdk/context-visibility-runtime";
export { getSessionEntry } from "bot/plugin-sdk/session-store-runtime";
export { readJsonFileWithFallback } from "bot/plugin-sdk/json-store";
export { normalizeAgentId } from "bot/plugin-sdk/routing";
export { chunkTextForOutbound } from "bot/plugin-sdk/text-chunking";
export {
  isRequestBodyLimitError,
  readRequestBodyWithLimit,
  requestBodyErrorToText,
} from "bot/plugin-sdk/webhook-ingress";
export { setFeishuRuntime } from "./src/runtime.js";
