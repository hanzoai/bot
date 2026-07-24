import type {
  AnyAgentTool,
  BotPluginApi,
  BotPluginToolFactory,
} from "@hanzo/bot/plugin-sdk/runbook";
import { createRunbookTool } from "./src/runbook-tool.js";

export default function register(api: BotPluginApi) {
  api.registerTool(
    ((ctx) => {
      if (ctx.sandboxed) {
        return null;
      }
      return createRunbookTool(api) as AnyAgentTool;
    }) as BotPluginToolFactory,
    { optional: true },
  );
}
