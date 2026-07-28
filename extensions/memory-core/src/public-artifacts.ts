// Memory Core plugin module implements public artifacts behavior.
import {
  listMemoryHostPublicArtifacts,
  type MemoryPluginPublicArtifact,
} from "bot/plugin-sdk/memory-host-core";
import type { BotConfig } from "../api.js";

export async function listMemoryCorePublicArtifacts(params: {
  cfg: BotConfig;
}): Promise<MemoryPluginPublicArtifact[]> {
  return await listMemoryHostPublicArtifacts(params);
}
