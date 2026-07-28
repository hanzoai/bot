// Telegram API module exposes the plugin public contract.
import type { BotConfig } from "./runtime-api.js";
import { inspectTelegramAccount } from "./src/account-inspect.js";

export function inspectTelegramReadOnlyAccount(cfg: BotConfig, accountId?: string | null) {
  return inspectTelegramAccount({ cfg, accountId });
}
