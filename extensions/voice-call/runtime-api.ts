// Private runtime barrel for the bundled Voice Call extension.
// Keep this barrel thin and aligned with the local extension surface.

export { definePluginEntry } from "bot/plugin-sdk/plugin-entry";
export type { BotPluginApi } from "bot/plugin-sdk/plugin-entry";
export type { GatewayRequestHandlerOptions } from "bot/plugin-sdk/gateway-runtime";
export {
  isRequestBodyLimitError,
  readRequestBodyWithLimit,
  requestBodyErrorToText,
} from "bot/plugin-sdk/webhook-request-guards";
export { fetchWithSsrFGuard, isBlockedHostnameOrIp } from "bot/plugin-sdk/ssrf-runtime";
export type { SessionEntry } from "bot/plugin-sdk/session-store-runtime";
export {
  TtsAutoSchema,
  TtsConfigSchema,
  TtsModeSchema,
  TtsProviderSchema,
} from "bot/plugin-sdk/tts-runtime";
export { sleep } from "bot/plugin-sdk/runtime-env";
