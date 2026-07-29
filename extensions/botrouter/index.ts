// BotRouter plugin entrypoint registers credential-scoped model routing and quota reporting.
import type {
  ProviderResolveDynamicModelContext,
  ProviderRuntimeModel,
} from "bot/plugin-sdk/plugin-entry";
import { defineSingleProviderPluginEntry } from "bot/plugin-sdk/provider-entry";
import { buildProviderReplayFamilyHooks } from "bot/plugin-sdk/provider-model-shared";
import { buildProviderToolCompatFamilyHooks } from "bot/plugin-sdk/provider-tools";
import manifest from "./bot.plugin.json" with { type: "json" };
import {
  buildBotRouterProviderConfig,
  normalizeBotRouterApiBaseUrl,
  normalizeBotRouterRootUrl,
  normalizeBotRouterResolvedModel,
} from "./provider-catalog.js";
import { wrapBotRouterProviderStream } from "./stream.js";
import { inspectPerplexityToolSchemas, normalizePerplexityToolSchemas } from "./tool-schemas.js";
import { fetchBotRouterUsage } from "./usage.js";

const PROVIDER_ID = "botrouter";
const ENV_VAR = "CLAWROUTER_API_KEY";

const openAiReplay = buildProviderReplayFamilyHooks({
  family: "openai-compatible",
  dropReasoningFromHistory: false,
});
const anthropicReplay = buildProviderReplayFamilyHooks({
  family: "native-anthropic-by-model",
});
const googleReplay = buildProviderReplayFamilyHooks({ family: "google-gemini" });
const openAiTools = buildProviderToolCompatFamilyHooks("openai");
const deepSeekTools = buildProviderToolCompatFamilyHooks("deepseek");
const geminiTools = buildProviderToolCompatFamilyHooks("gemini");
const perplexityTools = {
  normalizeToolSchemas: normalizePerplexityToolSchemas,
  inspectToolSchemas: inspectPerplexityToolSchemas,
};

function configuredBaseUrl(
  config: { models?: { providers?: Record<string, { baseUrl?: unknown }> } } | null | undefined,
): string | undefined {
  const value = config?.models?.providers?.[PROVIDER_ID]?.baseUrl;
  return typeof value === "string" ? value : undefined;
}

function dynamicModelScope(ctx: ProviderResolveDynamicModelContext): string {
  return JSON.stringify([
    ctx.agentDir ?? "",
    ctx.workspaceDir ?? "",
    ctx.authProfileId ?? "",
    normalizeBotRouterRootUrl(ctx.providerConfig?.baseUrl ?? configuredBaseUrl(ctx.config)),
  ]);
}

function buildRuntimeModels(
  providerConfig: Awaited<ReturnType<typeof buildBotRouterProviderConfig>>,
): Map<string, ProviderRuntimeModel> {
  const models = new Map<string, ProviderRuntimeModel>();
  for (const model of providerConfig.models) {
    const api = model.api ?? providerConfig.api;
    const baseUrl = model.baseUrl ?? providerConfig.baseUrl;
    if (!api || !baseUrl) {
      continue;
    }
    models.set(model.id, {
      ...model,
      api,
      baseUrl,
      provider: PROVIDER_ID,
      input: model.input.filter(
        (entry): entry is "text" | "image" => entry === "text" || entry === "image",
      ),
    });
  }
  return models;
}

function resolveToolFamily(modelId: string) {
  const normalized = modelId.toLowerCase();
  if (normalized.startsWith("deepseek/")) {
    return deepSeekTools;
  }
  if (normalized.startsWith("google/")) {
    return geminiTools;
  }
  if (normalized.startsWith("perplexity/")) {
    return perplexityTools;
  }
  return openAiTools;
}

export default defineSingleProviderPluginEntry({
  id: PROVIDER_ID,
  name: "BotRouter",
  description: "Managed multi-provider model routing and quotas",
  manifest,
  provider() {
    const dynamicModels = new Map<string, Map<string, ProviderRuntimeModel>>();

    return {
      label: "BotRouter",
      docsPath: "/providers/botrouter",
      manifestAuth: {
        hint: "Credential-scoped access to approved models and budgets",
        noteTitle: "BotRouter",
        noteMessage: [
          "Use the proxy key issued by your BotRouter administrator.",
          "Bot discovers only the models granted to that key.",
        ].join("\n"),
      },
      catalog: {
        order: "simple",
        run: async (ctx) => {
          const auth = ctx.resolveProviderAuth(PROVIDER_ID);
          let discoveryApiKey = auth.discoveryApiKey;
          if (!discoveryApiKey) {
            try {
              const { resolveApiKeyForProvider } =
                await import("bot/plugin-sdk/provider-auth-runtime");
              discoveryApiKey = (
                await resolveApiKeyForProvider({
                  provider: PROVIDER_ID,
                  cfg: ctx.config,
                  ...(ctx.agentDir ? { agentDir: ctx.agentDir } : {}),
                  ...(ctx.workspaceDir ? { workspaceDir: ctx.workspaceDir } : {}),
                  ...(auth.profileId ? { profileId: auth.profileId, lockedProfile: true } : {}),
                })
              )?.apiKey;
            } catch {
              return null;
            }
          }
          const apiKey = auth.apiKey ?? discoveryApiKey;
          if (!apiKey || !discoveryApiKey) {
            return null;
          }
          return {
            provider: await buildBotRouterProviderConfig({
              apiKey,
              discoveryApiKey,
              baseUrl: configuredBaseUrl(ctx.config),
            }),
          };
        },
      },
      resolveDynamicModel: (ctx) => dynamicModels.get(dynamicModelScope(ctx))?.get(ctx.modelId),
      // Match by agentDir/workspaceDir/baseUrl; the context carries no auth
      // profile id, so any profile scope for the same deployment counts.
      preferRuntimeResolvedModel: (ctx) => {
        const agentDir = ctx.agentDir ?? "";
        const workspaceDir = ctx.workspaceDir ?? "";
        const rootUrl = normalizeBotRouterRootUrl(configuredBaseUrl(ctx.config));
        for (const [scope, models] of dynamicModels) {
          const [scopeAgentDir, scopeWorkspaceDir, , scopeRootUrl] = JSON.parse(scope) as string[];
          if (
            scopeAgentDir === agentDir &&
            scopeWorkspaceDir === workspaceDir &&
            scopeRootUrl === rootUrl &&
            models.has(ctx.modelId)
          ) {
            return true;
          }
        }
        return false;
      },
      prepareDynamicModel: async (ctx) => {
        const scope = dynamicModelScope(ctx);
        const { resolveApiKeyForProvider } =
          await import("bot/plugin-sdk/provider-auth-runtime");
        const apiKey = (
          await resolveApiKeyForProvider({
            provider: PROVIDER_ID,
            cfg: ctx.config,
            ...(ctx.agentDir ? { agentDir: ctx.agentDir } : {}),
            ...(ctx.workspaceDir ? { workspaceDir: ctx.workspaceDir } : {}),
            ...(ctx.authProfileId ? { profileId: ctx.authProfileId, lockedProfile: true } : {}),
          })
        )?.apiKey;
        if (!apiKey) {
          // Rebuilds publish atomically so catalog errors keep the prior snapshot.
          // Missing credentials are the sole fail-closed clearing path.
          dynamicModels.delete(scope);
          return;
        }
        const providerConfig = await buildBotRouterProviderConfig({
          apiKey,
          discoveryApiKey: apiKey,
          baseUrl: ctx.providerConfig?.baseUrl ?? configuredBaseUrl(ctx.config),
        });
        dynamicModels.set(scope, buildRuntimeModels(providerConfig));
      },
      normalizeConfig: ({ providerConfig }) => {
        const baseUrl = normalizeBotRouterApiBaseUrl(providerConfig.baseUrl);
        return baseUrl !== providerConfig.baseUrl ? { ...providerConfig, baseUrl } : undefined;
      },
      normalizeResolvedModel: ({ model }) => normalizeBotRouterResolvedModel(model),
      wrapSimpleCompletionStreamFn: wrapBotRouterProviderStream,
      wrapStreamFn: wrapBotRouterProviderStream,
      buildReplayPolicy: (ctx) => {
        if (ctx.modelApi === "anthropic-messages") {
          return anthropicReplay.buildReplayPolicy?.(ctx);
        }
        if (ctx.modelApi === "google-generative-ai") {
          return googleReplay.buildReplayPolicy?.(ctx);
        }
        return openAiReplay.buildReplayPolicy?.(ctx);
      },
      sanitizeReplayHistory: (ctx) =>
        ctx.modelApi === "google-generative-ai"
          ? googleReplay.sanitizeReplayHistory?.(ctx)
          : undefined,
      resolveReasoningOutputMode: (ctx) =>
        ctx.modelApi === "google-generative-ai"
          ? googleReplay.resolveReasoningOutputMode?.(ctx)
          : undefined,
      normalizeToolSchemas: (ctx) => resolveToolFamily(ctx.modelId ?? "").normalizeToolSchemas(ctx),
      inspectToolSchemas: (ctx) => resolveToolFamily(ctx.modelId ?? "").inspectToolSchemas(ctx),
      isModernModelRef: () => true,
      resolveUsageAuth: async (ctx) => {
        const apiKey = ctx.resolveApiKeyFromConfigAndStore({
          envDirect: [ctx.env[ENV_VAR]],
        });
        return apiKey ? { token: apiKey } : null;
      },
      fetchUsageSnapshot: async (ctx) =>
        await fetchBotRouterUsage({
          token: ctx.token,
          baseUrl: configuredBaseUrl(ctx.config),
          timeoutMs: ctx.timeoutMs,
        }),
    };
  },
});
