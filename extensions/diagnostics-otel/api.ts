// Diagnostics Otel API module exposes the plugin public contract.
export {
  createChildDiagnosticTraceContext,
  createDiagnosticTraceContext,
  emitDiagnosticEvent,
  formatDiagnosticTraceparent,
  isValidDiagnosticSpanId,
  isValidDiagnosticTraceFlags,
  isValidDiagnosticTraceId,
  onDiagnosticEvent,
  parseDiagnosticTraceparent,
  type DiagnosticEventMetadata,
  type DiagnosticEventPayload,
  type DiagnosticEventPrivateData,
  type DiagnosticTraceContext,
} from "bot/plugin-sdk/diagnostic-runtime";
export { emptyPluginConfigSchema, type BotPluginApi } from "bot/plugin-sdk/plugin-entry";
export type {
  BotPluginService,
  BotPluginServiceContext,
} from "bot/plugin-sdk/plugin-entry";
export { redactSensitiveText } from "bot/plugin-sdk/security-runtime";
