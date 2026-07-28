type FallbackSkipCacheState = {
  buckets: Map<string, Map<string, unknown>>;
  lastGlobalPruneAtMs: number;
};

function getFallbackSkipCacheGlobals() {
  return globalThis as typeof globalThis & {
    botFallbackSkipCache?: Map<string, Map<string, unknown>>;
    botFallbackSkipCacheState?: FallbackSkipCacheState;
  };
}

export function resetFallbackSkipCacheForTest(): void {
  const globals = getFallbackSkipCacheGlobals();
  globals.botFallbackSkipCache?.clear();
  globals.botFallbackSkipCacheState?.buckets.clear();
  if (globals.botFallbackSkipCacheState) {
    globals.botFallbackSkipCacheState.lastGlobalPruneAtMs = 0;
  }
}

export function listFallbackSkipCacheSessionIdsForTest(): string[] {
  const globals = getFallbackSkipCacheGlobals();
  return [...(globals.botFallbackSkipCacheState?.buckets.keys() ?? [])];
}
