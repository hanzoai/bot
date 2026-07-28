export function normalizeTranscriptTimestamp(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function isWithinTranscriptWindow(
  timestamp: number | undefined,
  options: { beforeTimestampMs?: number; minTimestampMs?: number },
): boolean {
  return (
    (options.beforeTimestampMs === undefined ||
      timestamp === undefined ||
      timestamp < options.beforeTimestampMs) &&
    (options.minTimestampMs === undefined ||
      timestamp === undefined ||
      timestamp >= options.minTimestampMs)
  );
}

export function normalizeRecentTranscriptLimit(limit: number | undefined): number {
  return Math.max(1, Math.floor(limit ?? 10));
}

export function readPreferredUpstreamUserText(message: {
  __bot?: unknown;
}): string | null | undefined {
  const meta =
    message["__bot"] && typeof message["__bot"] === "object"
      ? (message["__bot"] as Record<string, unknown>)
      : undefined;
  if (typeof meta?.upstreamUserText === "string") {
    return meta.upstreamUserText.trim();
  }
  return meta?.mirrorOrigin ? null : undefined;
}
