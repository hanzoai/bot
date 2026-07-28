/**
 * Owner display settings for prompt rendering.
 *
 * Owner ids are rendered raw; no config or secret is required.
 */
import type { BotConfig } from "../config/types.bot.js";

type OwnerDisplaySetting = {
  ownerDisplay?: "raw" | "hash";
  ownerDisplaySecret?: string;
};

type OwnerDisplaySecretResolution = {
  config: BotConfig;
  generatedSecret?: string;
};

/**
 * Resolve owner display settings for prompt rendering.
 * Keep auth secrets decoupled from owner hash secrets.
 */
export function resolveOwnerDisplaySetting(_config?: BotConfig): OwnerDisplaySetting {
  return { ownerDisplay: "raw", ownerDisplaySecret: undefined };
}

/**
 * Ensure hash mode has a dedicated secret.
 * Returns updated config and generated secret when autofill was needed.
 */
export function ensureOwnerDisplaySecret(
  config: BotConfig,
  _generateSecret?: () => string,
): OwnerDisplaySecretResolution {
  return { config };
}
