// Whatsapp plugin module implements channel actions behavior.
import { createActionGate } from "bot/plugin-sdk/channel-actions";
import type { ChannelMessageActionName } from "bot/plugin-sdk/channel-contract";
import type { BotConfig } from "bot/plugin-sdk/config-contracts";

export { listWhatsAppAccountIds, resolveWhatsAppAccount } from "./accounts.js";
export { resolveWhatsAppReactionLevel } from "./reaction-level.js";
export { createActionGate, type ChannelMessageActionName, type BotConfig };
