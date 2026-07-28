// Zalo plugin module implements runtime support behavior.
export type { ReplyPayload } from "bot/plugin-sdk/reply-runtime";
export type { BotConfig, GroupPolicy } from "bot/plugin-sdk/config-contracts";
export type { MarkdownTableMode } from "bot/plugin-sdk/config-contracts";
export type { BaseTokenResolution } from "bot/plugin-sdk/channel-contract";
export type {
  BaseProbeResult,
  ChannelAccountSnapshot,
  ChannelMessageActionAdapter,
  ChannelMessageActionName,
  ChannelStatusIssue,
} from "bot/plugin-sdk/channel-contract";
export type { SecretInput } from "bot/plugin-sdk/secret-input";
export type { ChannelPlugin, PluginRuntime, WizardPrompter } from "bot/plugin-sdk/core";
export type { RuntimeEnv } from "bot/plugin-sdk/runtime";
export type { OutboundReplyPayload } from "bot/plugin-sdk/reply-payload";
export {
  DEFAULT_ACCOUNT_ID,
  buildChannelConfigSchema,
  createDedupeCache,
  formatPairingApproveHint,
  jsonResult,
  normalizeAccountId,
  readStringParam,
  resolveClientIp,
} from "bot/plugin-sdk/core";
export {
  applyAccountNameToChannelSection,
  applySetupAccountConfigPatch,
  buildSingleChannelSecretPromptState,
  mergeAllowFromEntries,
  migrateBaseNameToDefaultAccount,
  promptSingleChannelSecretInput,
  runSingleChannelSecretStep,
  setTopLevelChannelDmPolicyWithAllowFrom,
} from "bot/plugin-sdk/setup";
export {
  buildSecretInputSchema,
  hasConfiguredSecretInput,
  normalizeResolvedSecretInputString,
  normalizeSecretInputString,
} from "bot/plugin-sdk/secret-input";
export {
  buildTokenChannelStatusSummary,
  PAIRING_APPROVED_MESSAGE,
} from "bot/plugin-sdk/channel-status";
export { buildBaseAccountStatusSnapshot } from "bot/plugin-sdk/status-helpers";
export { chunkTextForOutbound } from "bot/plugin-sdk/text-chunking";
export {
  formatAllowFromLowercase,
  isNormalizedSenderAllowed,
} from "bot/plugin-sdk/allow-from";
export { addWildcardAllowFrom } from "bot/plugin-sdk/setup";
export { resolveOpenProviderRuntimeGroupPolicy } from "bot/plugin-sdk/runtime-group-policy";
export {
  warnMissingProviderGroupPolicyFallbackOnce,
  resolveDefaultGroupPolicy,
} from "bot/plugin-sdk/runtime-group-policy";
export { createChannelPairingController } from "bot/plugin-sdk/channel-pairing";
export { createChannelMessageReplyPipeline } from "bot/plugin-sdk/channel-outbound";
export { logTypingFailure } from "bot/plugin-sdk/channel-feedback";
export {
  deliverTextOrMediaReply,
  isNumericTargetId,
  sendPayloadWithChunkedTextAndMedia,
} from "bot/plugin-sdk/reply-payload";
export { waitForAbortSignal } from "bot/plugin-sdk/runtime";
export {
  applyBasicWebhookRequestGuards,
  createFixedWindowRateLimiter,
  createWebhookAnomalyTracker,
  readJsonWebhookBodyOrReject,
  registerPluginHttpRoute,
  registerWebhookTarget,
  registerWebhookTargetWithPluginRoute,
  resolveWebhookPath,
  resolveWebhookTargetWithAuthOrRejectSync,
  WEBHOOK_ANOMALY_COUNTER_DEFAULTS,
  WEBHOOK_RATE_LIMIT_DEFAULTS,
  withResolvedWebhookRequestPipeline,
} from "bot/plugin-sdk/webhook-ingress";
export type {
  RegisterWebhookPluginRouteOptions,
  RegisterWebhookTargetOptions,
} from "bot/plugin-sdk/webhook-ingress";
