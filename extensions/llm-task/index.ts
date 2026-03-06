import type { AnyAgentTool, BotPluginApi } from "@hanzo/bot/plugin-sdk/llm-task";
import { createLlmTaskTool } from "./src/llm-task-tool.js";

export default function register(api: BotPluginApi) {
  api.registerTool(createLlmTaskTool(api) as unknown as AnyAgentTool, { optional: true });
}
