// Tavily helper module supports tavily tool config behavior.
import type { BotConfig } from "bot/plugin-sdk/config-contracts";
import type { BotPluginToolContext } from "bot/plugin-sdk/plugin-entry";
import type { BotPluginApi } from "bot/plugin-sdk/plugin-runtime";

export type TavilyToolConfigContext = Pick<
  BotPluginToolContext,
  "config" | "runtimeConfig" | "getRuntimeConfig"
>;

export function resolveTavilyToolConfig(
  api: BotPluginApi,
  ctx?: TavilyToolConfigContext,
): BotConfig {
  return ctx?.getRuntimeConfig?.() ?? ctx?.runtimeConfig ?? ctx?.config ?? api.config;
}
