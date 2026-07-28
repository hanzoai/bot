// Irc API module exposes the plugin public contract.
export { createAccountStatusSink } from "bot/plugin-sdk/channel-outbound";
export { DEFAULT_ACCOUNT_ID } from "bot/plugin-sdk/account-id";
export type { ChannelPlugin } from "bot/plugin-sdk/channel-core";
export { PAIRING_APPROVED_MESSAGE } from "bot/plugin-sdk/channel-status";
export { buildBaseChannelStatusSummary } from "bot/plugin-sdk/status-helpers";
export { chunkTextForOutbound } from "bot/plugin-sdk/text-chunking";
