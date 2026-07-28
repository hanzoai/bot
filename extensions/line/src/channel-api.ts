// Line API module exposes the plugin public contract.
export { clearAccountEntryFields } from "bot/plugin-sdk/core";
import { DEFAULT_ACCOUNT_ID } from "bot/plugin-sdk/account-id";
import type { BotConfig } from "bot/plugin-sdk/account-resolution";
import type { ChannelPlugin } from "bot/plugin-sdk/core";
import { listLineAccountIds, resolveDefaultLineAccountId, resolveLineAccount } from "./accounts.js";
import { resolveExactLineGroupConfigKey } from "./group-keys.js";
import type { LineConfig, ResolvedLineAccount } from "./types.js";

export {
  DEFAULT_ACCOUNT_ID,
  listLineAccountIds,
  resolveDefaultLineAccountId,
  resolveExactLineGroupConfigKey,
  resolveLineAccount,
};

export type { ChannelPlugin, LineConfig, BotConfig, ResolvedLineAccount };
