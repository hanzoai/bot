// Matrix API module exposes the plugin public contract.
export {
  DEFAULT_ACCOUNT_ID,
  normalizeAccountId,
  normalizeOptionalAccountId,
} from "bot/plugin-sdk/account-id";
export {
  createActionGate,
  jsonResult,
  readNumberParam,
  readPositiveIntegerParam,
  readReactionParams,
  readStringArrayParam,
  readStringParam,
  ToolAuthorizationError,
} from "bot/plugin-sdk/channel-actions";
export { buildChannelConfigSchema } from "bot/plugin-sdk/channel-config-schema";
export type { ChannelPlugin } from "bot/plugin-sdk/channel-core";
export type {
  BaseProbeResult,
  ChannelDirectoryEntry,
  ChannelGroupContext,
  ChannelMessageActionAdapter,
  ChannelMessageActionContext,
  ChannelMessageActionName,
  ChannelMessageToolDiscovery,
  ChannelOutboundAdapter,
  ChannelResolveKind,
  ChannelResolveResult,
  ChannelToolSend,
} from "bot/plugin-sdk/channel-contract";
export {
  formatLocationText,
  toLocationContext,
  type NormalizedLocation,
} from "bot/plugin-sdk/channel-inbound";
export { logInboundDrop } from "bot/plugin-sdk/channel-inbound";
export { logTypingFailure } from "bot/plugin-sdk/channel-outbound";
export { resolveAckReaction } from "bot/plugin-sdk/channel-feedback";
export type { ChannelSetupInput } from "bot/plugin-sdk/setup";
export type {
  BotConfig,
  ContextVisibilityMode,
  DmPolicy,
  GroupPolicy,
} from "bot/plugin-sdk/config-contracts";
export type { GroupToolPolicyConfig } from "bot/plugin-sdk/config-contracts";
export type { WizardPrompter } from "bot/plugin-sdk/setup";
export type { SecretInput } from "bot/plugin-sdk/secret-input";
export {
  GROUP_POLICY_BLOCKED_LABEL,
  resolveAllowlistProviderRuntimeGroupPolicy,
  resolveDefaultGroupPolicy,
  warnMissingProviderGroupPolicyFallbackOnce,
} from "bot/plugin-sdk/runtime-group-policy";
export {
  addWildcardAllowFrom,
  formatDocsLink,
  hasConfiguredSecretInput,
  mergeAllowFromEntries,
  moveSingleAccountChannelSectionToDefaultAccount,
  promptAccountId,
  promptChannelAccessConfig,
  splitSetupEntries,
} from "bot/plugin-sdk/setup";
export type { RuntimeEnv } from "bot/plugin-sdk/runtime";
export {
  assertHttpUrlTargetsPrivateNetwork,
  closeDispatcher,
  createPinnedDispatcher,
  isPrivateOrLoopbackHost,
  resolvePinnedHostnameWithPolicy,
  ssrfPolicyFromDangerouslyAllowPrivateNetwork,
  type LookupFn,
  type SsrFPolicy,
} from "bot/plugin-sdk/ssrf-runtime";
export {
  ensureConfiguredAcpBindingReady,
  resolveConfiguredAcpBindingRecord,
} from "bot/plugin-sdk/acp-binding-runtime";
export {
  buildProbeChannelStatusSummary,
  collectStatusIssuesFromLastError,
  PAIRING_APPROVED_MESSAGE,
} from "bot/plugin-sdk/channel-status";
export {
  getSessionBindingService,
  resolveThreadBindingIdleTimeoutMsForChannel,
  resolveThreadBindingMaxAgeMsForChannel,
} from "bot/plugin-sdk/conversation-runtime";
export { resolveOutboundSendDep } from "bot/plugin-sdk/channel-outbound";
export { resolveAgentIdFromSessionKey } from "bot/plugin-sdk/routing";
export { chunkTextForOutbound } from "bot/plugin-sdk/text-chunking";
export { createChannelMessageReplyPipeline } from "bot/plugin-sdk/channel-outbound";
export { loadOutboundMediaFromUrl } from "bot/plugin-sdk/outbound-media";
export { normalizePollInput, type PollInput } from "bot/plugin-sdk/poll-runtime";
export { writeJsonFileAtomically } from "bot/plugin-sdk/json-store";
export {
  buildChannelKeyCandidates,
  resolveChannelEntryMatch,
} from "bot/plugin-sdk/channel-targets";
export { buildTimeoutAbortSignal } from "./matrix/sdk/timeout-abort-signal.js";
export { formatZonedTimestamp } from "bot/plugin-sdk/time-runtime";
export type { PluginRuntime, RuntimeLogger } from "bot/plugin-sdk/plugin-runtime";
export type { ReplyPayload } from "bot/plugin-sdk/reply-runtime";
// resolveMatrixAccountStringValues already comes from the Matrix API barrel.
// Re-exporting auth-precedence here makes TS source loaders define the export twice.
