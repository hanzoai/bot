// Signal plugin module implements account types behavior.
import type { BotConfig } from "bot/plugin-sdk/config-contracts";

type SignalChannelConfig = Exclude<NonNullable<BotConfig["channels"]>["signal"], undefined>;

export type SignalAccountConfig = Omit<SignalChannelConfig, "accounts" | "defaultAccount">;

export type SignalTransportConfig = NonNullable<SignalChannelConfig["transport"]>;
