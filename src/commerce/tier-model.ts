/**
 * Tier-to-model routing for Hanzo bot.
 * Free tier (developer): claude-sonnet-4-6 via Hanzo gateway -> DO GenAI (cheap)
 * Paid tier (pro/team/enterprise): zen4-pro via Hanzo gateway -> Fireworks (premium)
 */

export type PlanTier = "developer" | "pro" | "team" | "enterprise";

export interface ModelRef {
  provider: string;
  model: string;
}

const TIER_MODELS: Record<PlanTier, ModelRef> = {
  developer: { provider: "hanzo", model: "claude-sonnet-4-6" },
  pro: { provider: "hanzo", model: "zen4-pro" },
  team: { provider: "hanzo", model: "zen4-pro" },
  enterprise: { provider: "hanzo", model: "zen4-pro" },
};

export function resolveTierDefaultModel(tier: PlanTier): ModelRef {
  return TIER_MODELS[tier] ?? TIER_MODELS.developer;
}

export function shouldUpgradeModel(opts: {
  tier: PlanTier;
  currentProvider: string;
  currentModel: string;
}): ModelRef | null {
  const { tier, currentProvider, currentModel } = opts;
  // Only upgrade if user is on the free-tier default -- respect explicit overrides
  if (currentProvider !== "hanzo" || currentModel !== "claude-sonnet-4-6") {
    return null;
  }
  if (tier === "developer") {
    return null; // Already on free tier model
  }
  return TIER_MODELS[tier] ?? null;
}
