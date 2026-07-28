// Private runtime barrel for the bundled Nostr extension.
// Keep this barrel thin and aligned with the local extension surface.

export type { BotConfig } from "bot/plugin-sdk/config-contracts";
export { getPluginRuntimeGatewayRequestScope } from "bot/plugin-sdk/plugin-runtime";
export type { PluginRuntime } from "bot/plugin-sdk/runtime-store";
