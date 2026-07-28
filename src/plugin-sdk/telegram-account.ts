// Telegram account helpers resolve Telegram plugin account config and display metadata.
import type { BotConfig } from "./config-contracts.js";
import { loadBundledPluginPublicSurfaceModuleSync } from "./facade-loader.js";

/**
 * @deprecated Compatibility type for the `bot/plugin-sdk/telegram-account` facade.
 * New channel plugins should prefer injected runtime helpers and generic SDK subpaths.
 */
export type TelegramAccountConfig = NonNullable<
  NonNullable<BotConfig["channels"]>["telegram"]
>;

/**
 * @deprecated Compatibility type for the `bot/plugin-sdk/telegram-account` facade.
 * New channel plugins should prefer injected runtime helpers and generic SDK subpaths.
 */
export type ResolvedTelegramAccount = {
  accountId: string;
  enabled: boolean;
  name?: string;
  token: string;
  tokenSource: "env" | "tokenFile" | "config" | "none";
  config: TelegramAccountConfig;
};

type TelegramAccountFacadeModule = {
  resolveTelegramAccount: (params: {
    cfg: BotConfig;
    accountId?: string | null;
  }) => ResolvedTelegramAccount;
};

function loadTelegramAccountFacadeModule(): TelegramAccountFacadeModule {
  return loadBundledPluginPublicSurfaceModuleSync<TelegramAccountFacadeModule>({
    dirName: "telegram",
    artifactBasename: "api.js",
  });
}

/**
 * @deprecated Compatibility facade for plugin code that needs Telegram account resolution.
 * New channel plugins should prefer injected runtime helpers and generic SDK subpaths.
 */
export function resolveTelegramAccount(params: {
  cfg: BotConfig;
  accountId?: string | null;
}): ResolvedTelegramAccount {
  return loadTelegramAccountFacadeModule().resolveTelegramAccount(params);
}
