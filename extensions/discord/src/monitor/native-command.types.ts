// Discord type declarations define plugin contracts.
import type { BotConfig } from "bot/plugin-sdk/config-contracts";
import type { CommandArgValues } from "bot/plugin-sdk/native-command-registry";

export type DiscordConfig = NonNullable<BotConfig["channels"]>["discord"];

export type DiscordCommandArgs = {
  raw?: string;
  values?: CommandArgValues;
};
