# Observability Completeness

Use this rubric when assigning category Completeness scores for the
`telemetry-diagnostics-and-observability` surface.

## Category Scope

- Health and Repair: Background health-monitor loop, Per-account enable/disable settings, Startup grace, Restart logging, bot doctor, Structured health checks, Core doctor checks, Plugin SDK doctor/health contracts, bot status, bot health, Gateway RPC health, Cached health snapshots
- Logging: Rolling Gateway JSONL file logs, bot logs, Gateway RPC logs.tail, Redaction patterns and sinks, Trace correlation fields
- Diagnostic Collection: bot gateway diagnostics export, bot gateway stability --bundle, Chat /diagnostics, Support zip composition, Bounded in-process stability recorder, bot gateway stability, Memory pressure events, Critical memory pressure snapshot option
- Telemetry Export: Diagnostic event types, Async dispatch, W3C trace context creation, Plugin SDK diagnostic runtime exports, Model-call diagnostic events, diagnostics-otel plugin install, OTLP/HTTP traces, Trusted trace context, Model and runtime telemetry, diagnostics-prometheus plugin install, Gateway-authenticated GET /api/diagnostics/prometheus, Prometheus text exposition, Trusted diagnostic event subscription
- Session Diagnostics: session.state, Diagnostic session activity snapshots, Model usage, Export of session signals to stability
