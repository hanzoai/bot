import { emptyPluginConfigSchema } from "../plugins/config-schema.js";
import type {
  Hanzo BotPluginApi,
  Hanzo BotPluginCommandDefinition,
  Hanzo BotPluginConfigSchema,
  Hanzo BotPluginDefinition,
  PluginInteractiveTelegramHandlerContext,
} from "../plugins/types.js";

export type {
  AnyAgentTool,
  MediaUnderstandingProviderPlugin,
  Hanzo BotPluginApi,
  Hanzo BotPluginConfigSchema,
  ProviderDiscoveryContext,
  ProviderCatalogContext,
  ProviderCatalogResult,
  ProviderAugmentModelCatalogContext,
  ProviderBuiltInModelSuppressionContext,
  ProviderBuiltInModelSuppressionResult,
  ProviderBuildMissingAuthMessageContext,
  ProviderCacheTtlEligibilityContext,
  ProviderDefaultThinkingPolicyContext,
  ProviderFetchUsageSnapshotContext,
  ProviderModernModelPolicyContext,
  ProviderPreparedRuntimeAuth,
  ProviderResolvedUsageAuth,
  ProviderPrepareExtraParamsContext,
  ProviderPrepareDynamicModelContext,
  ProviderPrepareRuntimeAuthContext,
  ProviderResolveUsageAuthContext,
  ProviderResolveDynamicModelContext,
  ProviderNormalizeResolvedModelContext,
  ProviderRuntimeModel,
  SpeechProviderPlugin,
  ProviderThinkingPolicyContext,
  ProviderWrapStreamFnContext,
  Hanzo BotPluginService,
  Hanzo BotPluginServiceContext,
  ProviderAuthContext,
  ProviderAuthDoctorHintContext,
  ProviderAuthMethodNonInteractiveContext,
  ProviderAuthMethod,
  ProviderAuthResult,
  Hanzo BotPluginCommandDefinition,
  Hanzo BotPluginDefinition,
  PluginLogger,
  PluginInteractiveTelegramHandlerContext,
} from "../plugins/types.js";
export type { Hanzo BotConfig } from "../config/config.js";

export { emptyPluginConfigSchema } from "../plugins/config-schema.js";

type DefinePluginEntryOptions = {
  id: string;
  name: string;
  description: string;
  kind?: Hanzo BotPluginDefinition["kind"];
  configSchema?: Hanzo BotPluginConfigSchema | (() => Hanzo BotPluginConfigSchema);
  register: (api: Hanzo BotPluginApi) => void;
};

type DefinedPluginEntry = {
  id: string;
  name: string;
  description: string;
  configSchema: Hanzo BotPluginConfigSchema;
  register: NonNullable<Hanzo BotPluginDefinition["register"]>;
} & Pick<Hanzo BotPluginDefinition, "kind">;

function resolvePluginConfigSchema(
  configSchema: DefinePluginEntryOptions["configSchema"] = emptyPluginConfigSchema,
): Hanzo BotPluginConfigSchema {
  return typeof configSchema === "function" ? configSchema() : configSchema;
}

// Small entry surface for provider and command plugins that do not need channel helpers.
export function definePluginEntry({
  id,
  name,
  description,
  kind,
  configSchema = emptyPluginConfigSchema,
  register,
}: DefinePluginEntryOptions): DefinedPluginEntry {
  return {
    id,
    name,
    description,
    ...(kind ? { kind } : {}),
    configSchema: resolvePluginConfigSchema(configSchema),
    register,
  };
}
