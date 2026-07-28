// Whatsapp plugin module implements account types behavior.
import type { BotConfig } from "bot/plugin-sdk/config-contracts";

export type WhatsAppAccountConfig = NonNullable<
  NonNullable<NonNullable<BotConfig["channels"]>["whatsapp"]>["accounts"]
>[string];
