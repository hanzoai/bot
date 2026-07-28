// Private runtime barrel for the bundled Signal extension.
// Prefer narrower SDK subpaths plus local extension seams over the legacy signal barrel.

export type { ChannelMessageActionAdapter } from "bot/plugin-sdk/channel-contract";
export { buildChannelConfigSchema, SignalConfigSchema } from "../config-api.js";
export { PAIRING_APPROVED_MESSAGE } from "bot/plugin-sdk/channel-status";
import type { BotConfig as RuntimeBotConfig } from "bot/plugin-sdk/config-contracts";
export type { RuntimeBotConfig as BotConfig };
export type { BotPluginApi, PluginRuntime } from "bot/plugin-sdk/core";
export type { ChannelPlugin } from "bot/plugin-sdk/core";
export {
  DEFAULT_ACCOUNT_ID,
  applyAccountNameToChannelSection,
  deleteAccountFromConfigSection,
  emptyPluginConfigSchema,
  formatPairingApproveHint,
  getChatChannelMeta,
  migrateBaseNameToDefaultAccount,
  normalizeAccountId,
  setAccountEnabledInConfigSection,
} from "bot/plugin-sdk/core";
export { resolveChannelMediaMaxBytes } from "bot/plugin-sdk/media-runtime";
export { formatCliCommand, formatDocsLink } from "bot/plugin-sdk/setup-tools";
export { chunkText } from "bot/plugin-sdk/reply-runtime";
export { detectBinary } from "bot/plugin-sdk/setup-tools";
export {
  resolveAllowlistProviderRuntimeGroupPolicy,
  resolveDefaultGroupPolicy,
} from "bot/plugin-sdk/runtime-group-policy";
export {
  buildBaseAccountStatusSnapshot,
  buildBaseChannelStatusSummary,
  collectStatusIssuesFromLastError,
  createDefaultChannelRuntimeState,
} from "bot/plugin-sdk/status-helpers";
export { normalizeE164 } from "bot/plugin-sdk/text-utility-runtime";
export { looksLikeSignalTargetId, normalizeSignalMessagingTarget } from "./normalize.js";
export {
  listEnabledSignalAccounts,
  listSignalAccountIds,
  resolveDefaultSignalAccountId,
  resolveSignalAccount,
  resolveSignalTransport,
} from "./accounts.js";
export { monitorSignalProvider } from "./monitor.js";
export { installSignalCli } from "./install-signal-cli.js";
export { probeSignal } from "./probe.js";
export { resolveSignalReactionLevel } from "./reaction-level.js";
export { removeReactionSignal, sendReactionSignal } from "./send-reactions.js";
export { sendMessageSignal } from "./send.js";
export { signalMessageActions } from "./message-actions.js";
export type { ResolvedSignalAccount, ResolvedSignalTransport } from "./accounts.js";
export type { SignalAccountConfig, SignalTransportConfig } from "./account-types.js";
