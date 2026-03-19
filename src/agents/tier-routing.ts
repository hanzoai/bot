import { DEFAULT_MODEL, DEFAULT_PROVIDER } from "./defaults.js";

export type UserTier = "free" | "pro" | "enterprise";

type TierModelTarget = { provider: string; model: string };

const TIER_MODEL_MAP: Readonly<Record<UserTier, TierModelTarget>> = {
  free: { provider: DEFAULT_PROVIDER, model: DEFAULT_MODEL },
  pro: { provider: "hanzo", model: "zen4-pro" },
  enterprise: { provider: "hanzo", model: "zen4-pro" },
};

const VALID_TIERS = new Set<string>(Object.keys(TIER_MODEL_MAP));

function isValidTier(value: string): value is UserTier {
  return VALID_TIERS.has(value);
}

function parseProviderModel(spec: string): TierModelTarget {
  const slash = spec.indexOf("/");
  if (slash > 0) {
    return { provider: spec.slice(0, slash), model: spec.slice(slash + 1) };
  }
  return { provider: DEFAULT_PROVIDER, model: spec };
}

/**
 * Resolves the provider and model for a given user tier. When the caller
 * provides an explicit `requestedModel`, that model takes precedence over
 * the tier default -- tier routing only applies as a fallback.
 */
export function resolveModelForTier(
  tier: UserTier | string,
  requestedModel?: string,
): TierModelTarget {
  if (requestedModel) {
    return parseProviderModel(requestedModel);
  }
  const normalizedTier = tier.trim().toLowerCase();
  if (isValidTier(normalizedTier)) {
    return TIER_MODEL_MAP[normalizedTier];
  }
  return TIER_MODEL_MAP.free;
}
