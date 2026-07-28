// Feishu API module exposes the plugin public contract.
export type {
  ChannelMessageActionName,
  ChannelMeta,
  ChannelPlugin,
  ClawdbotConfig,
} from "../runtime-api.js";

export { DEFAULT_ACCOUNT_ID } from "bot/plugin-sdk/account-resolution";
export { createActionGate } from "bot/plugin-sdk/channel-actions";
export {
  buildProbeChannelStatusSummary,
  createDefaultChannelRuntimeState,
} from "bot/plugin-sdk/status-helpers";
export { PAIRING_APPROVED_MESSAGE } from "bot/plugin-sdk/channel-status";
