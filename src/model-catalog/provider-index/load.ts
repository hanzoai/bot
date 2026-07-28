// Provider-index loader normalizes bundled installable-provider metadata and falls back to an empty index.
import { normalizeBotProviderIndex } from "./normalize.js";
import { BOT_PROVIDER_INDEX } from "./bot-provider-index.js";
import type { BotProviderIndex } from "./types.js";

// Load the bundled provider index through the normalizer. Invalid generated or
// caller-supplied data falls back to an empty v1 index instead of leaking shape.
export function loadBotProviderIndex(
  source: unknown = BOT_PROVIDER_INDEX,
): BotProviderIndex {
  return normalizeBotProviderIndex(source) ?? { version: 1, providers: {} };
}
