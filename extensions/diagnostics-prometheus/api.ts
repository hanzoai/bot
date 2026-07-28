// Diagnostics Prometheus API module exposes the plugin public contract.
export type {
  DiagnosticEventMetadata,
  DiagnosticEventPayload,
} from "bot/plugin-sdk/diagnostic-runtime";
export { isInternalDiagnosticEventMetadata } from "bot/plugin-sdk/diagnostic-runtime";
export {
  emptyPluginConfigSchema,
  type BotPluginApi,
  type BotPluginHttpRouteHandler,
  type BotPluginService,
  type BotPluginServiceContext,
} from "bot/plugin-sdk/plugin-entry";
export { redactSensitiveText } from "bot/plugin-sdk/security-runtime";
