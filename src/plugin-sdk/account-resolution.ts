/**
 * Public SDK subpath for account id normalization and account matching helpers.
 */
export {
  createAccountListHelpers,
  hasConfiguredAccountValue,
  listCombinedAccountIds,
  normalizeAccountId,
  normalizeE164,
  normalizeOptionalAccountId,
  resolveListedDefaultAccountId,
  resolveMergedAccountConfig,
  resolveNormalizedAccountEntry,
  resolveUserPath,
  DEFAULT_ACCOUNT_ID,
} from "./account-core.js";

export type { BotConfig } from "../config/types.bot.js";
export { resolveAccountEntry } from "../routing/account-lookup.js";
