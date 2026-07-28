import type { BotConfig } from "../config/types.bot.js";
import type { PluginMetadataSnapshot } from "../plugins/plugin-metadata-snapshot.js";
import "./models-config.plan.js";
import type { ProviderConfig } from "./models-config.providers.secrets.js";

type ResolveImplicitProvidersForModelsJson = (params: {
  agentDir: string;
  config: BotConfig;
  env: NodeJS.ProcessEnv;
  workspaceDir?: string;
  explicitProviders: Record<string, ProviderConfig>;
  pluginMetadataSnapshot?: Pick<PluginMetadataSnapshot, "index" | "manifestRegistry" | "owners">;
  providerDiscoveryProviderIds?: readonly string[];
  providerDiscoveryTimeoutMs?: number;
  providerDiscoveryEntriesOnly?: boolean;
}) => Promise<Record<string, ProviderConfig>>;

type PlanParams = Parameters<typeof import("./models-config.plan.js").planBotModelsJson>[0];
type PlanResult = Awaited<
  ReturnType<typeof import("./models-config.plan.js").planBotModelsJson>
>;
type ResolveProvidersParams = {
  cfg: BotConfig;
  agentDir: string;
  env: NodeJS.ProcessEnv;
  workspaceDir?: string;
  pluginMetadataSnapshot?: Pick<PluginMetadataSnapshot, "index" | "manifestRegistry" | "owners">;
  providerDiscoveryProviderIds?: readonly string[];
  providerDiscoveryTimeoutMs?: number;
  providerDiscoveryEntriesOnly?: boolean;
};
type PlanDeps = { resolveImplicitProviders?: ResolveImplicitProvidersForModelsJson };

type ModelsConfigPlanTestApi = {
  planBotModelsJsonWithDeps(params: PlanParams, deps?: PlanDeps): Promise<PlanResult>;
  resolveProvidersForModelsJsonWithDeps(
    params: ResolveProvidersParams,
    deps?: PlanDeps,
  ): Promise<Record<string, ProviderConfig>>;
};

function getTestApi(): ModelsConfigPlanTestApi {
  return (globalThis as Record<PropertyKey, unknown>)[
    Symbol.for("bot.modelsConfigPlanTestApi")
  ] as ModelsConfigPlanTestApi;
}

export const planBotModelsJsonWithDeps = async (
  params: PlanParams,
  deps?: PlanDeps,
): Promise<PlanResult> => await getTestApi().planBotModelsJsonWithDeps(params, deps);

export const resolveProvidersForModelsJsonWithDeps = async (
  params: ResolveProvidersParams,
  deps?: PlanDeps,
): Promise<Record<string, ProviderConfig>> =>
  await getTestApi().resolveProvidersForModelsJsonWithDeps(params, deps);
