import type { AuthProfileStore } from "../../../agents/auth-profiles/types.js";
import type { BotConfig } from "../../../config/types.bot.js";
import "./stale-auth-order.js";

type TestApi = {
  repairStaleConfiguredAuthOrders(params: {
    cfg: BotConfig;
    stores: readonly AuthProfileStore[];
    activeStores?: readonly AuthProfileStore[];
    runtimeProfileIds?: ReadonlySet<string>;
  }): { config: BotConfig; changes: string[] };
};

function getTestApi(): TestApi {
  return (globalThis as Record<PropertyKey, unknown>)[
    Symbol.for("bot.staleAuthOrderTestApi")
  ] as TestApi;
}

export const repairStaleConfiguredAuthOrders: TestApi["repairStaleConfiguredAuthOrders"] = (
  params,
) => getTestApi().repairStaleConfiguredAuthOrders(params);
