// Telegram Mini App registerFull entrypoint.
import type { BotPluginApi } from "bot/plugin-sdk/plugin-entry";
import { registerTelegramMiniAppCommand } from "./src/miniapp/command.js";
import { registerTelegramMiniAppRoutes } from "./src/miniapp/routes.js";

export function registerTelegramMiniApp(api: BotPluginApi): void {
  registerTelegramMiniAppRoutes(api);
  registerTelegramMiniAppCommand(api);
}
