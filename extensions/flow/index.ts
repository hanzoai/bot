import type { AnyAgentTool, BotPluginApi, BotPluginToolFactory } from "../../src/plugins/types.js";
import { createFlowTool } from "./src/flow-tool.js";

export default function register(api: BotPluginApi) {
  api.registerTool(
    ((ctx) => {
      if (ctx.sandboxed) {
        return null;
      }
      return createFlowTool(api) as AnyAgentTool;
    }) as BotPluginToolFactory,
    { optional: true },
  );
}
