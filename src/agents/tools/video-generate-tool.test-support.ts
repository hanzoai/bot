import type { BotConfig } from "../../config/types.bot.js";
import type { AuthProfileStore } from "../auth-profiles/types.js";
import type { ToolModelConfig } from "./model-config.helpers.js";
import "./video-generate-tool.js";

type VideoGenerateToolTestApi = {
  resolveVideoGenerationModelConfigForTool(params: {
    cfg?: BotConfig;
    workspaceDir?: string;
    agentDir?: string;
    authStore?: AuthProfileStore;
  }): ToolModelConfig | null;
};

function getTestApi(): VideoGenerateToolTestApi {
  return (globalThis as Record<PropertyKey, unknown>)[
    Symbol.for("bot.videoGenerateToolTestApi")
  ] as VideoGenerateToolTestApi;
}

export const resolveVideoGenerationModelConfigForTool: VideoGenerateToolTestApi["resolveVideoGenerationModelConfigForTool"] =
  (params) => getTestApi().resolveVideoGenerationModelConfigForTool(params);
