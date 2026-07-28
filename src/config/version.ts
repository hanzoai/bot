// Normalizes config version metadata and compatibility comparisons.
import { parse as parseSemver, type SemVer } from "semver";
import {
  compareBotSemver,
  isBotCorrectionSemver,
  normalizeLegacyDotBetaVersion,
} from "../infra/semver.js";

/** Parses stable, prerelease, and legacy dot-beta Bot versions. */
function parseBotVersion(raw: string | null | undefined): SemVer | null {
  if (!raw) {
    return null;
  }
  const normalized = normalizeLegacyDotBetaVersion(raw.trim());
  return parseSemver(normalized);
}

export function normalizeBotVersionBase(raw: string | null | undefined): string | null {
  const parsed = parseBotVersion(raw);
  if (!parsed) {
    return null;
  }
  return `${parsed.major}.${parsed.minor}.${parsed.patch}`;
}

export function compareBotVersions(
  a: string | null | undefined,
  b: string | null | undefined,
): number | null {
  const parsedA = parseBotVersion(a);
  const parsedB = parseBotVersion(b);
  if (!parsedA || !parsedB) {
    return null;
  }
  return compareBotSemver(parsedA, parsedB);
}

export function shouldWarnOnTouchedVersion(
  current: string | null | undefined,
  touched: string | null | undefined,
): boolean {
  const parsedCurrent = parseBotVersion(current);
  const parsedTouched = parseBotVersion(touched);
  if (parsedCurrent && parsedTouched && parsedCurrent.compareMain(parsedTouched) === 0) {
    if (parsedTouched.prerelease.length === 0 || isBotCorrectionSemver(parsedTouched)) {
      return false;
    }
  }
  return parsedCurrent !== null && parsedTouched !== null
    ? compareBotSemver(parsedCurrent, parsedTouched) < 0
    : false;
}
