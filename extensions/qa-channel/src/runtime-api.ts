// Qa Channel API module exposes the plugin public contract.
export type {
  ChannelMessageActionAdapter,
  ChannelMessageActionName,
  ChannelGatewayContext,
} from "bot/plugin-sdk/channel-contract";
export type { ChannelPlugin } from "bot/plugin-sdk/channel-core";
export type { BotConfig } from "bot/plugin-sdk/config-contracts";
export type { RuntimeEnv } from "bot/plugin-sdk/runtime";
export type { PluginRuntime } from "bot/plugin-sdk/runtime-store";
export {
  buildChannelConfigSchema,
  buildChannelOutboundSessionRoute,
  createChatChannelPlugin,
  defineChannelPluginEntry,
} from "bot/plugin-sdk/channel-core";
export { jsonResult, readStringParam } from "bot/plugin-sdk/channel-actions";
export { getChatChannelMeta } from "bot/plugin-sdk/channel-plugin-common";
export {
  createComputedAccountStatusAdapter,
  createDefaultChannelRuntimeState,
} from "bot/plugin-sdk/status-helpers";
export { createPluginRuntimeStore } from "bot/plugin-sdk/runtime-store";
export { createChannelMessageReplyPipeline } from "bot/plugin-sdk/channel-outbound";
