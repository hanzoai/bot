// Private runtime barrel for the bundled Nextcloud Talk extension.
// Keep this barrel thin and aligned with the local extension surface.

export type { AllowlistMatch } from "bot/plugin-sdk/allow-from";
export type { ChannelGroupContext } from "bot/plugin-sdk/channel-contract";
export { logInboundDrop } from "bot/plugin-sdk/channel-inbound";
export { createChannelPairingController } from "bot/plugin-sdk/channel-pairing";
export type {
  BlockStreamingCoalesceConfig,
  DmConfig,
  DmPolicy,
  GroupPolicy,
  GroupToolPolicyConfig,
  BotConfig,
} from "bot/plugin-sdk/config-contracts";
export {
  GROUP_POLICY_BLOCKED_LABEL,
  resolveAllowlistProviderRuntimeGroupPolicy,
  resolveDefaultGroupPolicy,
  warnMissingProviderGroupPolicyFallbackOnce,
} from "bot/plugin-sdk/runtime-group-policy";
export { createChannelMessageReplyPipeline } from "bot/plugin-sdk/channel-outbound";
export type { OutboundReplyPayload } from "bot/plugin-sdk/reply-payload";
export { deliverFormattedTextWithAttachments } from "bot/plugin-sdk/reply-payload";
export type { PluginRuntime } from "bot/plugin-sdk/runtime-store";
export type { RuntimeEnv } from "bot/plugin-sdk/runtime";
export type { SecretInput } from "bot/plugin-sdk/secret-input";
export { fetchWithSsrFGuard } from "bot/plugin-sdk/ssrf-runtime";
export { setNextcloudTalkRuntime } from "./src/runtime.js";
