/** Detects legacy SecretRef env markers in config values. */
import type { BotConfig } from "../config/types.bot.js";
import {
  LEGACY_SECRETREF_ENV_MARKER_PREFIX,
  parseLegacySecretRefEnvMarker,
  type SecretRef,
} from "../config/types.secrets.js";
import { setPathExistingStrict } from "./path-utils.js";
import {
  discoverConfigSecretTargets,
  type DiscoveredConfigSecretTarget,
} from "./target-registry.js";

/** Legacy marker string found on a registered secret target, with parsed ref when possible. */
type LegacySecretRefEnvMarkerCandidate = {
  path: string;
  pathSegments: string[];
  value: string;
  ref: SecretRef | null;
};

function isLegacySecretRefEnvMarker(value: unknown): value is string {
  return typeof value === "string" && value.trim().startsWith(LEGACY_SECRETREF_ENV_MARKER_PREFIX);
}

function toCandidate(
  target: DiscoveredConfigSecretTarget,
  defaults: NonNullable<BotConfig["secrets"]>["defaults"] | undefined,
): LegacySecretRefEnvMarkerCandidate | null {
  if (!isLegacySecretRefEnvMarker(target.value)) {
    return null;
  }
  return {
    path: target.path,
    pathSegments: target.pathSegments,
    value: target.value.trim(),
    ref: parseLegacySecretRefEnvMarker(target.value, defaults?.env),
  };
}

/**
 * Finds legacy env marker strings on registered secret targets without mutating config.
 */
function collectLegacySecretRefEnvMarkerCandidates(
  config: BotConfig,
): LegacySecretRefEnvMarkerCandidate[] {
  const defaults = config.secrets?.defaults;
  return discoverConfigSecretTargets(config)
    .map((target) => toCandidate(target, defaults))
    .filter((candidate): candidate is LegacySecretRefEnvMarkerCandidate => candidate !== null);
}

/**
 * Converts parseable legacy env marker strings into structured env SecretRef objects.
 */
export function migrateLegacySecretRefEnvMarkers(config: BotConfig): {
  config: BotConfig;
  changes: string[];
} {
  const candidates = collectLegacySecretRefEnvMarkerCandidates(config).filter(
    (candidate) => candidate.ref !== null,
  );
  if (candidates.length === 0) {
    return { config, changes: [] };
  }

  const next = structuredClone(config) as BotConfig & Record<string, unknown>;
  const changes: string[] = [];
  for (const candidate of candidates) {
    const ref = candidate.ref;
    if (!ref) {
      continue;
    }
    // Only registered existing paths are rewritten; malformed markers remain for explicit repair.
    if (setPathExistingStrict(next, candidate.pathSegments, ref)) {
      changes.push(
        `Moved ${candidate.path} ${LEGACY_SECRETREF_ENV_MARKER_PREFIX}${ref.id} marker → structured env SecretRef.`,
      );
    }
  }
  return { config: next, changes };
}
