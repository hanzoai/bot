// Qqbot API module exposes the plugin public contract.
export type { ChannelPlugin, BotPluginApi, PluginRuntime } from "bot/plugin-sdk/core";
export type { BotConfig } from "bot/plugin-sdk/config-contracts";
export type {
  BotPluginService,
  BotPluginServiceContext,
  PluginLogger,
} from "bot/plugin-sdk/core";
export type { ResolvedQQBotAccount, QQBotAccountConfig } from "./src/types.js";
export { getQQBotRuntime, setQQBotRuntime } from "./src/bridge/runtime.js";
