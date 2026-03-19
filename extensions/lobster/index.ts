import { definePluginEntry } from "openclaw/plugin-sdk/core";
import type { AnyAgentTool, HanzoBotPluginApi, HanzoBotPluginToolFactory } from "./runtime-api.js";
import { createLobsterTool } from "./src/lobster-tool.js";

export default definePluginEntry({
  id: "lobster",
  name: "Lobster",
  description: "Optional local shell helper tools",
  register(api: HanzoBotPluginApi) {
    api.registerTool(
      ((ctx) => {
        if (ctx.sandboxed) {
          return null;
        }
        return createLobsterTool(api) as AnyAgentTool;
      }) as HanzoBotPluginToolFactory,
      { optional: true },
    );
  },
});
