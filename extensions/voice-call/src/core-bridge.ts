// Voice Call plugin module implements core bridge behavior.
import type { BotConfig } from "bot/plugin-sdk/config-contracts";
import type { BotPluginApi } from "../api.js";

// Narrow core runtime/config contracts consumed by the voice-call plugin.

/** Core config subset read by voice-call helpers. */
export type CoreConfig = BotConfig;

/** Agent runtime API subset exposed through the plugin SDK. */
export type CoreAgentDeps = BotPluginApi["runtime"]["agent"];
