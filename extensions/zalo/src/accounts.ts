// Zalo plugin module implements accounts behavior.
import { createAccountListHelpers } from "bot/plugin-sdk/account-helpers";
import { normalizeAccountId } from "bot/plugin-sdk/account-id";
import type { BotConfig } from "bot/plugin-sdk/config-contracts";
import { normalizeOptionalString } from "bot/plugin-sdk/string-coerce-runtime";
import { resolveZaloToken } from "./token.js";
import type { ResolvedZaloAccount, ZaloAccountConfig, ZaloConfig } from "./types.js";

export type { ResolvedZaloAccount };

const {
  listAccountIds: listZaloAccountIds,
  resolveDefaultAccountId: resolveDefaultZaloAccountId,
  resolveAccountConfig: mergeZaloAccountConfig,
} = createAccountListHelpers<ZaloAccountConfig>("zalo", {
  omitKeys: ["defaultAccount"],
  implicitDefaultAccount: {
    channelKeys: ["botToken", "tokenFile"],
    envVars: ["ZALO_BOT_TOKEN"],
  },
});
export { listZaloAccountIds, resolveDefaultZaloAccountId };

export function resolveZaloAccount(params: {
  cfg: BotConfig;
  accountId?: string | null;
  allowUnresolvedSecretRef?: boolean;
}): ResolvedZaloAccount {
  const accountId = normalizeAccountId(
    params.accountId ?? (params.cfg.channels?.zalo as ZaloConfig | undefined)?.defaultAccount,
  );
  const baseEnabled = (params.cfg.channels?.zalo as ZaloConfig | undefined)?.enabled !== false;
  const merged = mergeZaloAccountConfig(params.cfg, accountId);
  const accountEnabled = merged.enabled !== false;
  const enabled = baseEnabled && accountEnabled;
  const tokenResolution = resolveZaloToken(
    params.cfg.channels?.zalo as ZaloConfig | undefined,
    accountId,
    { allowUnresolvedSecretRef: params.allowUnresolvedSecretRef },
  );

  return {
    accountId,
    name: normalizeOptionalString(merged.name),
    enabled,
    token: tokenResolution.token,
    tokenSource: tokenResolution.source,
    config: merged,
  };
}

export function listEnabledZaloAccounts(cfg: BotConfig): ResolvedZaloAccount[] {
  return listZaloAccountIds(cfg)
    .map((accountId) => resolveZaloAccount({ cfg, accountId }))
    .filter((account) => account.enabled);
}
