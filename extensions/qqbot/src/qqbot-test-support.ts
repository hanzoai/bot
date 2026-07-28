// Qqbot plugin module implements qqbot test support behavior.
import type { BotConfig } from "bot/plugin-sdk/config-contracts";

export function makeQqbotSecretRefConfig(): BotConfig {
  return {
    channels: {
      qqbot: {
        appId: "123456",
        clientSecret: {
          source: "env",
          provider: "default",
          id: "QQBOT_CLIENT_SECRET",
        },
      },
    },
  } as BotConfig;
}

export function makeQqbotDefaultAccountConfig(): BotConfig {
  return {
    channels: {
      qqbot: {
        defaultAccount: "bot2",
        accounts: {
          bot2: { appId: "123456" },
        },
      },
    },
  } as BotConfig;
}
