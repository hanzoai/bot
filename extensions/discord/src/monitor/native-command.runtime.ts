import { dispatchChannelInboundTurn } from "bot/plugin-sdk/channel-inbound";
// Discord plugin module implements native command behavior.
import { resolveDirectStatusReplyForSession } from "bot/plugin-sdk/command-status-runtime";
import * as pluginRuntime from "bot/plugin-sdk/plugin-runtime";
import { getSessionEntry } from "bot/plugin-sdk/session-store-runtime";
import { resolveDiscordNativeInteractionRouteState } from "./native-command-route.js";

export const nativeCommandRuntime = {
  matchPluginCommand: pluginRuntime.matchPluginCommand,
  executePluginCommand: pluginRuntime.executePluginCommand,
  dispatchChannelInboundTurn,
  resolveDirectStatusReplyForSession,
  resolveDiscordNativeInteractionRouteState,
  getSessionEntry,
};
