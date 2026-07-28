// Mattermost API module exposes the plugin public contract.
export { createAccountStatusSink } from "bot/plugin-sdk/channel-outbound";
export type { ChannelPlugin } from "bot/plugin-sdk/core";
export { DEFAULT_ACCOUNT_ID } from "bot/plugin-sdk/core";
export { chunkTextForOutbound } from "bot/plugin-sdk/text-chunking";
