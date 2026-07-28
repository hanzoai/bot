// Private runtime barrel for the bundled Google Chat extension.
// Keep this barrel thin and avoid broad plugin-sdk surfaces during bootstrap.

export { DEFAULT_ACCOUNT_ID } from "bot/plugin-sdk/account-id";
export {
  createActionGate,
  jsonResult,
  readNumberParam,
  readReactionParams,
  readStringParam,
} from "bot/plugin-sdk/channel-actions";
export { buildChannelConfigSchema, GoogleChatConfigSchema } from "./config-api.js";
export type {
  ChannelMessageActionAdapter,
  ChannelMessageActionName,
  ChannelStatusIssue,
} from "bot/plugin-sdk/channel-contract";
export { missingTargetError } from "bot/plugin-sdk/channel-feedback";
export {
  createAccountStatusSink,
  runPassiveAccountLifecycle,
} from "bot/plugin-sdk/channel-outbound";
export { createChannelPairingController } from "bot/plugin-sdk/channel-pairing";
export { createChannelMessageReplyPipeline } from "bot/plugin-sdk/channel-outbound";
export { PAIRING_APPROVED_MESSAGE } from "bot/plugin-sdk/channel-status";
export { chunkTextForOutbound } from "bot/plugin-sdk/text-chunking";
export type { BotConfig } from "bot/plugin-sdk/config-contracts";
export {
  GROUP_POLICY_BLOCKED_LABEL,
  resolveAllowlistProviderRuntimeGroupPolicy,
  resolveDefaultGroupPolicy,
  warnMissingProviderGroupPolicyFallbackOnce,
} from "bot/plugin-sdk/runtime-group-policy";
export { isDangerousNameMatchingEnabled } from "bot/plugin-sdk/dangerous-name-runtime";
export type { PluginRuntime } from "bot/plugin-sdk/runtime-store";
export { fetchWithSsrFGuard } from "bot/plugin-sdk/ssrf-runtime";
export type {
  GoogleChatAccountConfig,
  GoogleChatConfig,
} from "bot/plugin-sdk/config-contracts";
export { extractToolSend } from "bot/plugin-sdk/tool-send";
export { resolveInboundMentionDecision } from "bot/plugin-sdk/channel-inbound";
export { resolveWebhookPath } from "bot/plugin-sdk/webhook-ingress";
export {
  registerWebhookTargetWithPluginRoute,
  resolveWebhookTargetWithAuthOrReject,
  withResolvedWebhookRequestPipeline,
} from "bot/plugin-sdk/webhook-targets";
export {
  createWebhookInFlightLimiter,
  readJsonWebhookBodyOrReject,
  type WebhookInFlightLimiter,
} from "bot/plugin-sdk/webhook-request-guards";
export { setGoogleChatRuntime } from "./src/runtime.js";
