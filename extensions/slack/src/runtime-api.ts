// Slack API module exposes the plugin public contract.
export {
  buildComputedAccountStatusSnapshot,
  PAIRING_APPROVED_MESSAGE,
  projectCredentialSnapshotFields,
  resolveConfiguredFromRequiredCredentialStatuses,
} from "bot/plugin-sdk/channel-status";
export { buildChannelConfigSchema, SlackConfigSchema } from "../config-api.js";
export type { ChannelMessageActionContext } from "bot/plugin-sdk/channel-contract";
export { DEFAULT_ACCOUNT_ID } from "bot/plugin-sdk/account-id";
export type {
  ChannelPlugin,
  BotPluginApi,
  PluginRuntime,
} from "bot/plugin-sdk/channel-plugin-common";
export type { BotConfig } from "bot/plugin-sdk/config-contracts";
export type { SlackAccountConfig } from "bot/plugin-sdk/config-contracts";
export {
  emptyPluginConfigSchema,
  formatPairingApproveHint,
} from "bot/plugin-sdk/channel-plugin-common";
export { loadOutboundMediaFromUrl } from "bot/plugin-sdk/outbound-media";
export { looksLikeSlackTargetId, normalizeSlackMessagingTarget } from "./target-parsing.js";
export { getChatChannelMeta } from "./channel-api.js";
export {
  createActionGate,
  imageResultFromFile,
  jsonResult,
  readNumberParam,
  readPositiveIntegerParam,
  readReactionParams,
  readStringParam,
  withNormalizedTimestamp,
} from "bot/plugin-sdk/channel-actions";
