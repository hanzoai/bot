import type { BotConfig } from "../../config/types.bot.js";
import type { AuthProfileStore } from "../auth-profiles/types.js";
import type { ToolModelConfig } from "./model-config.helpers.js";
import "./image-generate-tool.js";

type ImageGenerateToolTestApi = {
  resolveImageGenerationModelConfigForTool(params: {
    cfg?: BotConfig;
    workspaceDir?: string;
    agentDir?: string;
    authStore?: AuthProfileStore;
  }): ToolModelConfig | null;
};

function getTestApi(): ImageGenerateToolTestApi {
  return (globalThis as Record<PropertyKey, unknown>)[
    Symbol.for("bot.imageGenerateToolTestApi")
  ] as ImageGenerateToolTestApi;
}

export const resolveImageGenerationModelConfigForTool: ImageGenerateToolTestApi["resolveImageGenerationModelConfigForTool"] =
  (params) => getTestApi().resolveImageGenerationModelConfigForTool(params);
