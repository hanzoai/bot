// Imessage plugin module implements account types behavior.
import type { BotConfig } from "bot/plugin-sdk/config-contracts";

export type IMessageAccountConfig = Omit<
  NonNullable<NonNullable<BotConfig["channels"]>["imessage"]>,
  "accounts" | "defaultAccount"
>;
