// Defaults for agent metadata when upstream does not supply them.
// Model id uses the Hanzo Cloud provider with tier-aware routing.
export const DEFAULT_PROVIDER = "hanzo";
export const DEFAULT_MODEL = "claude-sonnet-4-6"; // Free tier default (cheap via DO GenAI)
export const FREE_TIER_MODEL = "claude-sonnet-4-6";
export const PAID_TIER_MODEL = "zen4-pro";
// Conservative fallback used when model metadata is unavailable.
export const DEFAULT_CONTEXT_TOKENS = 131_000;
