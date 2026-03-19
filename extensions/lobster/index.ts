import { definePluginEntry } from "openclaw/plugin-sdk/core";
import type { AnyAgentTool, Hanzo BotPluginApi, Hanzo BotPluginToolFactory } from "./runtime-api.js";
import { createLobsterTool } from "./src/lobster-tool.js";

export default definePluginEntry({
  id: "lobster",
  name: "Lobster",
  description: "Optional local shell helper tools",
  register(api: Hanzo BotPluginApi) {
    api.registerTool(
      ((ctx) => {
        if (ctx.sandboxed) {
          return null;
        }
        return createLobsterTool(api) as AnyAgentTool;
      }) as Hanzo BotPluginToolFactory,
      { optional: true },
    );
  },
});
