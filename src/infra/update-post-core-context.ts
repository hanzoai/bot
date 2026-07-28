import type { BotConfig } from "../config/types.bot.js";

export const POST_CORE_UPDATE_ENV = "BOT_UPDATE_POST_CORE";
export const POST_CORE_UPDATE_SOURCE_CONFIG_PATH_ENV =
  "BOT_UPDATE_POST_CORE_SOURCE_CONFIG_PATH";

export type PreUpdateConfigRestoreInput = {
  sourceConfig: BotConfig;
  authoredConfig: BotConfig;
};
