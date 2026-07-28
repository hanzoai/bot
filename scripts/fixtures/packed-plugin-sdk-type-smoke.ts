// Packed Plugin Sdk Type Smoke script supports Bot repository automation.
type PublicPluginSdkModules = [
  typeof import("bot/plugin-sdk/core"),
  typeof import("bot/plugin-sdk/channel-entry-contract"),
  typeof import("bot/plugin-sdk/config-contracts"),
  typeof import("bot/plugin-sdk/plugin-entry"),
  typeof import("bot/plugin-sdk/runtime-env"),
];

const resolvedModules = null as unknown as PublicPluginSdkModules;

void resolvedModules;
