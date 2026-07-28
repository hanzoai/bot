import { SpanStatusCode } from "@opentelemetry/api";
import { redactSensitiveText } from "../api.js";
import type { DiagnosticEventMetadata, DiagnosticEventPayload } from "../api.js";
import { lowCardinalityAttr } from "./service-attributes.js";
import { positiveFiniteNumber } from "./service-genai-attributes.js";
import {
  assignOtelToolContentAttributes,
  assignOtelToolIdentityAttributes,
} from "./service-genai-content.js";
import type { OtelToolCallContent } from "./service-genai-content.js";
import type { DiagnosticsRecorderRuntime } from "./service-recorder-runtime.js";
import type { TelemetryExporterDiagnosticEvent } from "./service-types.js";

export function createToolAndSystemRecorders(runtime: DiagnosticsRecorderRuntime) {
  const {
    queueDepthHistogram,
    skillUsedCounter,
    toolExecutionDurationHistogram,
    toolExecutionBlockedCounter,
    execProcessDurationHistogram,
    payloadLargeCounter,
    payloadLargeBytesHistogram,
    livenessWarningCounter,
    livenessEventLoopDelayP99Histogram,
    livenessEventLoopDelayMaxHistogram,
    livenessEventLoopUtilizationHistogram,
    livenessCpuCoreRatioHistogram,
    telemetryExporterCounter,
    spanWithDuration,
    activeTrustedParentContext,
    trackTrustedSpan,
    takeTrackedTrustedSpan,
    setSpanAttrs,
    addRunAttrs,
    paramsSummaryAttrs,
    contentCapturePolicy,
    tracesEnabled,
  } = runtime;

  const toolExecutionBaseAttrs = (
    evt: Extract<
      DiagnosticEventPayload,
      {
        type:
          | "tool.execution.started"
          | "tool.execution.completed"
          | "tool.execution.error"
          | "tool.execution.blocked";
      }
    >,
  ): Record<string, string | number | boolean> => ({
    "bot.toolName": evt.toolName,
    "bot.tool.source": lowCardinalityAttr(evt.toolSource, "core"),
    "gen_ai.tool.name": evt.toolName,
    ...(evt.toolOwner ? { "bot.tool.owner": lowCardinalityAttr(evt.toolOwner) } : {}),
    ...paramsSummaryAttrs(evt.paramsSummary),
  });

  const skillUsedAttrs = (
    evt: Extract<DiagnosticEventPayload, { type: "skill.used" }>,
  ): Record<string, string | number | boolean> => ({
    "bot.skill.name": lowCardinalityAttr(evt.skillName, "skill"),
    "bot.skill.source": lowCardinalityAttr(evt.skillSource),
    "bot.skill.activation": lowCardinalityAttr(evt.activation),
    ...(evt.agentId ? { "bot.agent": lowCardinalityAttr(evt.agentId) } : {}),
    ...(evt.toolName ? { "bot.toolName": lowCardinalityAttr(evt.toolName, "tool") } : {}),
  });

  const recordSkillUsed = (
    evt: Extract<DiagnosticEventPayload, { type: "skill.used" }>,
    metadata: DiagnosticEventMetadata,
  ) => {
    if (!metadata.trusted) {
      return;
    }
    const attrs = skillUsedAttrs(evt);
    skillUsedCounter.add(1, attrs);
    if (!tracesEnabled) {
      return;
    }
    const spanAttrs: Record<string, string | number | boolean> = { ...attrs };
    addRunAttrs(spanAttrs, evt);
    const span = spanWithDuration("bot.skill.used", spanAttrs, 0, {
      parentContext: activeTrustedParentContext(evt, metadata),
      endTimeMs: evt.ts,
    });
    setSpanAttrs(span, spanAttrs);
    span.end(evt.ts);
  };

  const recordToolExecutionStarted = (
    evt: Extract<DiagnosticEventPayload, { type: "tool.execution.started" }>,
    metadata: DiagnosticEventMetadata,
  ) => {
    if (!tracesEnabled || !metadata.trusted) {
      return;
    }
    const spanAttrs = toolExecutionBaseAttrs(evt);
    assignOtelToolIdentityAttributes(spanAttrs, evt);
    trackTrustedSpan(
      evt,
      metadata,
      spanWithDuration("bot.tool.execution", spanAttrs, undefined, {
        parentContext: activeTrustedParentContext(evt, metadata),
        startTimeMs: evt.ts,
      }),
    );
  };

  const recordToolExecutionCompleted = (
    evt: Extract<DiagnosticEventPayload, { type: "tool.execution.completed" }>,
    metadata: DiagnosticEventMetadata,
    toolContent?: OtelToolCallContent,
  ) => {
    const attrs = toolExecutionBaseAttrs(evt);
    toolExecutionDurationHistogram.record(evt.durationMs, attrs);
    if (!tracesEnabled) {
      return;
    }
    const spanAttrs: Record<string, string | number | boolean> = { ...attrs };
    addRunAttrs(spanAttrs, evt);
    assignOtelToolIdentityAttributes(spanAttrs, evt);
    assignOtelToolContentAttributes(spanAttrs, toolContent, contentCapturePolicy);
    const span =
      takeTrackedTrustedSpan(evt, metadata) ??
      spanWithDuration("bot.tool.execution", spanAttrs, evt.durationMs, {
        parentContext: activeTrustedParentContext(evt, metadata),
        endTimeMs: evt.ts,
      });
    setSpanAttrs(span, spanAttrs);
    span.end(evt.ts);
  };

  const recordToolExecutionError = (
    evt: Extract<DiagnosticEventPayload, { type: "tool.execution.error" }>,
    metadata: DiagnosticEventMetadata,
    toolContent?: OtelToolCallContent,
  ) => {
    const attrs = {
      ...toolExecutionBaseAttrs(evt),
      "bot.errorCategory": lowCardinalityAttr(evt.errorCategory, "other"),
    };
    toolExecutionDurationHistogram.record(evt.durationMs, attrs);
    if (!tracesEnabled) {
      return;
    }
    const spanAttrs: Record<string, string | number | boolean> = { ...attrs };
    addRunAttrs(spanAttrs, evt);
    assignOtelToolIdentityAttributes(spanAttrs, evt);
    if (evt.errorCode) {
      spanAttrs["bot.errorCode"] = lowCardinalityAttr(evt.errorCode, "other");
    }
    assignOtelToolContentAttributes(spanAttrs, toolContent, contentCapturePolicy);
    const span =
      takeTrackedTrustedSpan(evt, metadata) ??
      spanWithDuration("bot.tool.execution", spanAttrs, evt.durationMs, {
        parentContext: activeTrustedParentContext(evt, metadata),
        endTimeMs: evt.ts,
      });
    setSpanAttrs(span, spanAttrs);
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: redactSensitiveText(evt.errorCategory),
    });
    span.end(evt.ts);
  };

  const recordToolExecutionBlocked = (
    evt: Extract<DiagnosticEventPayload, { type: "tool.execution.blocked" }>,
    metadata: DiagnosticEventMetadata,
  ) => {
    toolExecutionBlockedCounter.add(1, {
      ...toolExecutionBaseAttrs(evt),
      "bot.deniedReason": lowCardinalityAttr(evt.deniedReason, "other"),
    });
    if (!tracesEnabled) {
      return;
    }
    const spanAttrs: Record<string, string | number | boolean> = {
      ...toolExecutionBaseAttrs(evt),
      "bot.outcome": "blocked",
      "bot.deniedReason": lowCardinalityAttr(evt.deniedReason, "other"),
    };
    addRunAttrs(spanAttrs, evt);
    assignOtelToolIdentityAttributes(spanAttrs, evt);
    const span = spanWithDuration("bot.tool.execution", spanAttrs, 0, {
      parentContext: activeTrustedParentContext(evt, metadata),
      endTimeMs: evt.ts,
    });
    setSpanAttrs(span, spanAttrs);
    span.end(evt.ts);
  };

  const recordPayloadLarge = (evt: Extract<DiagnosticEventPayload, { type: "payload.large" }>) => {
    const attrs = {
      "bot.payload.action": evt.action,
      "bot.payload.surface": lowCardinalityAttr(evt.surface, "unknown"),
      "bot.channel": lowCardinalityAttr(evt.channel, "none"),
      "bot.plugin": lowCardinalityAttr(evt.pluginId, "none"),
      "bot.reason": lowCardinalityAttr(evt.reason, "none"),
    };
    payloadLargeCounter.add(1, attrs);
    const bytes = positiveFiniteNumber(evt.bytes);
    if (bytes !== undefined) {
      payloadLargeBytesHistogram.record(bytes, attrs);
    }
  };

  const recordExecProcessCompleted = (
    evt: Extract<DiagnosticEventPayload, { type: "exec.process.completed" }>,
  ) => {
    const attrs: Record<string, string | number> = {
      "bot.exec.target": evt.target,
      "bot.exec.mode": evt.mode,
      "bot.outcome": evt.outcome,
    };
    if (evt.failureKind) {
      attrs["bot.failureKind"] = evt.failureKind;
    }
    execProcessDurationHistogram.record(evt.durationMs, attrs);
    if (!tracesEnabled) {
      return;
    }

    const spanAttrs: Record<string, string | number | boolean> = {
      ...attrs,
      "bot.exec.command_length": evt.commandLength,
    };
    if (typeof evt.exitCode === "number") {
      spanAttrs["bot.exec.exit_code"] = evt.exitCode;
    }
    if (evt.exitSignal) {
      spanAttrs["bot.exec.exit_signal"] = lowCardinalityAttr(evt.exitSignal, "other");
    }
    if (evt.timedOut !== undefined) {
      spanAttrs["bot.exec.timed_out"] = evt.timedOut;
    }

    const span = spanWithDuration("bot.exec", spanAttrs, evt.durationMs, {
      endTimeMs: evt.ts,
    });
    if (evt.outcome === "failed") {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        ...(evt.failureKind ? { message: evt.failureKind } : {}),
      });
    }
    span.end(evt.ts);
  };

  const recordHeartbeat = (
    evt: Extract<DiagnosticEventPayload, { type: "diagnostic.heartbeat" }>,
  ) => {
    queueDepthHistogram.record(evt.queued, { "bot.channel": "heartbeat" });
  };

  const recordLivenessWarning = (
    evt: Extract<DiagnosticEventPayload, { type: "diagnostic.liveness.warning" }>,
  ) => {
    const reason = evt.reasons.join(":");
    const attrs = {
      "bot.liveness.reason": lowCardinalityAttr(reason, "unknown"),
    };
    livenessWarningCounter.add(1, attrs);
    queueDepthHistogram.record(evt.queued, { "bot.channel": "liveness" });
    if (evt.eventLoopDelayP99Ms !== undefined) {
      livenessEventLoopDelayP99Histogram.record(evt.eventLoopDelayP99Ms, attrs);
    }
    if (evt.eventLoopDelayMaxMs !== undefined) {
      livenessEventLoopDelayMaxHistogram.record(evt.eventLoopDelayMaxMs, attrs);
    }
    if (evt.eventLoopUtilization !== undefined) {
      livenessEventLoopUtilizationHistogram.record(evt.eventLoopUtilization, attrs);
    }
    if (evt.cpuCoreRatio !== undefined) {
      livenessCpuCoreRatioHistogram.record(evt.cpuCoreRatio, attrs);
    }
    if (!tracesEnabled) {
      return;
    }
    const spanAttrs: Record<string, string | number> = {
      ...attrs,
      "bot.liveness.active": evt.active,
      "bot.liveness.waiting": evt.waiting,
      "bot.liveness.queued": evt.queued,
      "bot.liveness.interval_ms": evt.intervalMs,
      ...(evt.eventLoopDelayP99Ms !== undefined
        ? { "bot.liveness.event_loop_delay_p99_ms": evt.eventLoopDelayP99Ms }
        : {}),
      ...(evt.eventLoopDelayMaxMs !== undefined
        ? { "bot.liveness.event_loop_delay_max_ms": evt.eventLoopDelayMaxMs }
        : {}),
      ...(evt.eventLoopUtilization !== undefined
        ? { "bot.liveness.event_loop_utilization": evt.eventLoopUtilization }
        : {}),
      ...(evt.cpuUserMs !== undefined ? { "bot.liveness.cpu_user_ms": evt.cpuUserMs } : {}),
      ...(evt.cpuSystemMs !== undefined
        ? { "bot.liveness.cpu_system_ms": evt.cpuSystemMs }
        : {}),
      ...(evt.cpuTotalMs !== undefined ? { "bot.liveness.cpu_total_ms": evt.cpuTotalMs } : {}),
      ...(evt.cpuCoreRatio !== undefined
        ? { "bot.liveness.cpu_core_ratio": evt.cpuCoreRatio }
        : {}),
    };
    const span = spanWithDuration("bot.liveness.warning", spanAttrs, 0, {
      endTimeMs: evt.ts,
    });
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: reason,
    });
    span.end(evt.ts);
  };

  const recordDiagnosticPhaseCompleted = (
    evt: Extract<DiagnosticEventPayload, { type: "diagnostic.phase.completed" }>,
  ) => {
    if (!tracesEnabled) {
      return;
    }
    const spanAttrs: Record<string, string | number> = {
      "bot.phase": lowCardinalityAttr(evt.name, "unknown"),
      ...(evt.cpuUserMs !== undefined ? { "bot.phase.cpu_user_ms": evt.cpuUserMs } : {}),
      ...(evt.cpuSystemMs !== undefined ? { "bot.phase.cpu_system_ms": evt.cpuSystemMs } : {}),
      ...(evt.cpuTotalMs !== undefined ? { "bot.phase.cpu_total_ms": evt.cpuTotalMs } : {}),
      ...(evt.cpuCoreRatio !== undefined
        ? { "bot.phase.cpu_core_ratio": evt.cpuCoreRatio }
        : {}),
    };
    for (const [key, value] of Object.entries(evt.details ?? {})) {
      spanAttrs[`bot.phase.detail.${key}`] =
        typeof value === "boolean" ? String(value) : value;
    }
    const span = spanWithDuration("bot.diagnostic.phase", spanAttrs, evt.durationMs, {
      endTimeMs: evt.ts,
    });
    span.end(evt.ts);
  };

  const recordTelemetryExporter = (
    evt: TelemetryExporterDiagnosticEvent,
    metadata: DiagnosticEventMetadata,
  ) => {
    if (!metadata.trusted) {
      return;
    }
    telemetryExporterCounter.add(1, {
      "bot.exporter": lowCardinalityAttr(evt.exporter, "unknown"),
      "bot.signal": evt.signal,
      "bot.status": evt.status,
      ...(evt.reason ? { "bot.reason": evt.reason } : {}),
      ...(evt.errorCategory
        ? { "bot.errorCategory": lowCardinalityAttr(evt.errorCategory, "other") }
        : {}),
    });
  };

  return {
    recordSkillUsed,
    recordToolExecutionStarted,
    recordToolExecutionCompleted,
    recordToolExecutionError,
    recordToolExecutionBlocked,
    recordPayloadLarge,
    recordExecProcessCompleted,
    recordHeartbeat,
    recordLivenessWarning,
    recordDiagnosticPhaseCompleted,
    recordTelemetryExporter,
  };
}
