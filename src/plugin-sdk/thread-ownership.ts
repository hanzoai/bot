// Narrow plugin-sdk surface for the bundled thread-ownership plugin.
// Keep this list additive and scoped to symbols used under extensions/thread-ownership.

export { definePluginEntry } from "./core.js";
export type { Hanzo BotConfig } from "../config/config.js";
export type { Hanzo BotPluginApi } from "../plugins/types.js";
