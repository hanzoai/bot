// Narrow plugin-sdk surface for the bundled memory-lancedb plugin.
// Keep this list additive and scoped to symbols used under extensions/memory-lancedb.

export { definePluginEntry } from "./core.js";
export type { Hanzo BotPluginApi } from "../plugins/types.js";
