import type { BotPluginApi } from "bot/plugin-sdk/plugin-entry";
import { createClaudeSessionNodeHostCommands } from "./session-catalog-node-commands.js";
import { registerClaudeSessionCatalog } from "./session-catalog.js";

function isClaudeSessionCatalogEnabled(pluginConfig: unknown): boolean {
  if (!pluginConfig || typeof pluginConfig !== "object") {
    return true;
  }
  const sessionCatalog = (pluginConfig as { sessionCatalog?: unknown }).sessionCatalog;
  return !(
    sessionCatalog &&
    typeof sessionCatalog === "object" &&
    (sessionCatalog as { enabled?: unknown }).enabled === false
  );
}

export function registerClaudeSessionDiscovery(api: BotPluginApi): void {
  if (!isClaudeSessionCatalogEnabled(api.pluginConfig)) {
    return;
  }
  registerClaudeSessionCatalog(api);
  for (const command of createClaudeSessionNodeHostCommands()) {
    api.registerNodeHostCommand(command);
  }
}
