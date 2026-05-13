import type {
  AnyAgentTool,
  BotPluginApi,
  BotPluginToolFactory,
} from "@hanzo/bot/plugin-sdk/lobster";
import { createLobsterTool } from "./src/lobster-tool.js";

export default function register(api: BotPluginApi) {
  api.registerTool(
    ((ctx) => {
      if (ctx.sandboxed) {
        return null;
      }
      return createLobsterTool(api) as AnyAgentTool;
    }) as BotPluginToolFactory,
    { optional: true },
  );
}
