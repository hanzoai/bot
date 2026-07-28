// Discord API module exposes the plugin public contract.
import type { BotConfig } from "bot/plugin-sdk/config-contracts";
import { inspectDiscordAccount } from "./src/account-inspect.js";

export function inspectDiscordReadOnlyAccount(cfg: BotConfig, accountId?: string | null) {
  return inspectDiscordAccount({ cfg, accountId });
}
