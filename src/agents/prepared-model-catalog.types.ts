import type { BotConfig } from "../config/types.bot.js";
import type { ModelCatalogSnapshot } from "./model-catalog.types.js";

export type PublishedModelCatalogOwnerCandidate = Readonly<{
  agentId?: string;
  agentDir: string;
  workspaceDir?: string;
  config: BotConfig;
  modelCatalog: ModelCatalogSnapshot;
}>;

export type ResolvedPublishedModelCatalogOwner = Readonly<{
  agentId: string;
  agentDir: string;
  workspaceDir: string;
  config: BotConfig;
  modelCatalog: ModelCatalogSnapshot;
}>;
