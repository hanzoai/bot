/** Detects whether a daemon was launched by Bot's container-aware service wrapper. */
import { normalizeOptionalString } from "@hanzo/bot-normalization-core/string-coerce";

/** Resolves the daemon container hint exposed by managed service environments. */
export function resolveDaemonContainerContext(
  env: Record<string, string | undefined> = process.env,
): string | null {
  return (
    normalizeOptionalString(env.BOT_CONTAINER_HINT) ||
    normalizeOptionalString(env.BOT_CONTAINER) ||
    null
  );
}
