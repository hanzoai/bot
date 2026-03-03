import type { StreamFn } from "@mariozechner/pi-agent-core";
import type { SimpleStreamOptions } from "@mariozechner/pi-ai";
import { streamSimple } from "@mariozechner/pi-ai";
import type { BotConfig } from "../../config/config.js";
import { log } from "./logger.js";

const OPENROUTER_APP_HEADERS: Record<string, string> = {
  "HTTP-Referer": "https://hanzo.bot",
  "X-Title": "Bot",
};
// NOTE: We only force `store=true` for *direct* OpenAI Responses.
// Codex responses (chatgpt.com/backend-api/codex/responses) require `store=false`.
const OPENAI_RESPONSES_APIS = new Set(["openai-responses"]);
const OPENAI_RESPONSES_PROVIDERS = new Set(["openai"]);

const VALID_TRANSPORT_VALUES = new Set(["auto", "sse", "websocket"]);

const PI_AI_DEFAULT_BETAS = [
  "fine-grained-tool-streaming-2025-05-14",
  "interleaved-thinking-2025-05-14",
];

const OAUTH_REQUIRED_BETAS = ["oauth-2025-04-20", "claude-code-20250219"];

const CONTEXT_1M_BETA = "context-1m-2025-08-07";

const OPUS_SONNET_RE = /claude-(?:opus|sonnet)-/i;

/**
 * Resolve provider-specific extra params from model config.
 * Used to pass through stream params like temperature/maxTokens.
 *
 * @internal Exported for testing only
 */
export function resolveExtraParams(params: {
  cfg: BotConfig | undefined;
  provider: string;
  modelId: string;
  agentId?: string;
}): Record<string, unknown> | undefined {
  const modelKey = `${params.provider}/${params.modelId}`;
  const defaults = params.cfg?.agents?.defaults;
  const modelConfig = defaults?.models?.[modelKey];
  const globalParams = modelConfig?.params ? { ...modelConfig.params } : undefined;

  // Look up per-agent params from agents.list
  let agentParams: Record<string, unknown> | undefined;
  if (params.agentId) {
    const agentEntry = params.cfg?.agents?.list?.find(
      (a: { id?: string }) => a.id === params.agentId,
    );
    if (agentEntry?.params) {
      agentParams = { ...agentEntry.params };
    }
  }

  if (!globalParams && !agentParams) {
    return undefined;
  }
  if (!agentParams) {
    return globalParams;
  }
  if (!globalParams) {
    return agentParams;
  }
  return { ...globalParams, ...agentParams };
}

type CacheRetention = "none" | "short" | "long";
type CacheRetentionStreamOptions = Partial<SimpleStreamOptions> & {
  cacheRetention?: CacheRetention;
  openaiWsWarmup?: boolean;
};

/**
 * Resolve cacheRetention from extraParams, supporting both new `cacheRetention`
 * and legacy `cacheControlTtl` values for backwards compatibility.
 *
 * Mapping: "5m" -> "short", "1h" -> "long"
 *
 * Only applies to Anthropic provider (OpenRouter uses openai-completions API
 * with hardcoded cache_control, not the cacheRetention stream option).
 */
function resolveCacheRetention(
  extraParams: Record<string, unknown> | undefined,
  provider: string,
): CacheRetention | undefined {
  if (provider !== "anthropic") {
    return undefined;
  }

  // Prefer new cacheRetention if present
  const newVal = extraParams?.cacheRetention;
  if (newVal === "none" || newVal === "short" || newVal === "long") {
    return newVal;
  }

  // Fall back to legacy cacheControlTtl with mapping
  const legacy = extraParams?.cacheControlTtl;
  if (legacy === "5m") {
    return "short";
  }
  if (legacy === "1h") {
    return "long";
  }
  return undefined;
}

function createStreamFnWithExtraParams(
  baseStreamFn: StreamFn | undefined,
  extraParams: Record<string, unknown> | undefined,
  provider: string,
): StreamFn | undefined {
  if (!extraParams || Object.keys(extraParams).length === 0) {
    return undefined;
  }

  const streamParams: CacheRetentionStreamOptions = {};
  if (typeof extraParams.temperature === "number") {
    streamParams.temperature = extraParams.temperature;
  }
  if (typeof extraParams.maxTokens === "number") {
    streamParams.maxTokens = extraParams.maxTokens;
  }
  const cacheRetention = resolveCacheRetention(extraParams, provider);
  if (cacheRetention) {
    streamParams.cacheRetention = cacheRetention;
  }

  if (Object.keys(streamParams).length === 0) {
    return undefined;
  }

  log.debug(`creating streamFn wrapper with params: ${JSON.stringify(streamParams)}`);

  const underlying = baseStreamFn ?? streamSimple;
  const wrappedStreamFn: StreamFn = (model, context, options) =>
    underlying(model, context, {
      ...streamParams,
      ...options,
    });

  return wrappedStreamFn;
}

function isDirectOpenAIBaseUrl(baseUrl: unknown): boolean {
  if (typeof baseUrl !== "string" || !baseUrl.trim()) {
    return false;
  }

  try {
    const host = new URL(baseUrl).hostname.toLowerCase();
    return host === "api.openai.com" || host === "chatgpt.com";
  } catch {
    const normalized = baseUrl.toLowerCase();
    return normalized.includes("api.openai.com") || normalized.includes("chatgpt.com");
  }
}

function shouldForceResponsesStore(model: {
  api?: unknown;
  provider?: unknown;
  baseUrl?: unknown;
  compat?: { supportsStore?: boolean };
}): boolean {
  // Never force store=true when the model explicitly declares supportsStore=false
  // (e.g. Azure OpenAI Responses API without server-side persistence).
  if (model.compat?.supportsStore === false) {
    return false;
  }
  if (typeof model.api !== "string" || typeof model.provider !== "string") {
    return false;
  }
  if (!OPENAI_RESPONSES_APIS.has(model.api)) {
    return false;
  }
  if (!OPENAI_RESPONSES_PROVIDERS.has(model.provider)) {
    return false;
  }
  return isDirectOpenAIBaseUrl(model.baseUrl);
}

function parsePositiveInteger(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return undefined;
}

function resolveOpenAIResponsesCompactThreshold(model: { contextWindow?: unknown }): number {
  const contextWindow = parsePositiveInteger(model.contextWindow);
  if (contextWindow) {
    return Math.max(1_000, Math.floor(contextWindow * 0.7));
  }
  return 80_000;
}

function shouldEnableOpenAIResponsesServerCompaction(
  model: {
    api?: unknown;
    provider?: unknown;
    baseUrl?: unknown;
    compat?: { supportsStore?: boolean };
  },
  extraParams: Record<string, unknown> | undefined,
): boolean {
  const configured = extraParams?.responsesServerCompaction;
  if (configured === false) {
    return false;
  }
  if (!shouldForceResponsesStore(model)) {
    return false;
  }
  if (configured === true) {
    return true;
  }
  // Auto-enable for direct OpenAI Responses models.
  return model.provider === "openai";
}

function createOpenAIResponsesContextManagementWrapper(
  baseStreamFn: StreamFn | undefined,
  extraParams: Record<string, unknown> | undefined,
): StreamFn {
  const underlying = baseStreamFn ?? streamSimple;
  return (model, context, options) => {
    const forceStore = shouldForceResponsesStore(model);
    const useServerCompaction = shouldEnableOpenAIResponsesServerCompaction(model, extraParams);
    if (!forceStore && !useServerCompaction) {
      return underlying(model, context, options);
    }

    const compactThreshold =
      parsePositiveInteger(extraParams?.responsesCompactThreshold) ??
      resolveOpenAIResponsesCompactThreshold(model);
    const originalOnPayload = options?.onPayload;
    return underlying(model, context, {
      ...options,
      onPayload: (payload) => {
        if (payload && typeof payload === "object") {
          const payloadObj = payload as Record<string, unknown>;
          if (forceStore) {
            payloadObj.store = true;
          }
          if (useServerCompaction && payloadObj.context_management === undefined) {
            payloadObj.context_management = [
              {
                type: "compaction",
                compact_threshold: compactThreshold,
              },
            ];
          }
        }
        originalOnPayload?.(payload);
      },
    });
  };
}

type MoonshotThinkingType = "enabled" | "disabled";

function normalizeMoonshotThinkingType(value: unknown): MoonshotThinkingType | undefined {
  if (typeof value === "boolean") {
    return value ? "enabled" : "disabled";
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (
      normalized === "enabled" ||
      normalized === "enable" ||
      normalized === "on" ||
      normalized === "true"
    ) {
      return "enabled";
    }
    if (
      normalized === "disabled" ||
      normalized === "disable" ||
      normalized === "off" ||
      normalized === "false"
    ) {
      return "disabled";
    }
    return undefined;
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const typeValue = (value as Record<string, unknown>).type;
    return normalizeMoonshotThinkingType(typeValue);
  }
  return undefined;
}

function resolveMoonshotThinkingType(params: {
  configuredThinking: unknown;
  thinkingLevel?: ThinkLevel;
}): MoonshotThinkingType | undefined {
  const configured = normalizeMoonshotThinkingType(params.configuredThinking);
  if (configured) {
    return configured;
  }
  if (!params.thinkingLevel) {
    return undefined;
  }
  return params.thinkingLevel === "off" ? "disabled" : "enabled";
}

function isMoonshotToolChoiceCompatible(toolChoice: unknown): boolean {
  if (toolChoice == null) {
    return true;
  }
  if (toolChoice === "auto" || toolChoice === "none") {
    return true;
  }
  if (typeof toolChoice === "object" && !Array.isArray(toolChoice)) {
    const typeValue = (toolChoice as Record<string, unknown>).type;
    return typeValue === "auto" || typeValue === "none";
  }
  return false;
}

/**
 * Moonshot Kimi supports native binary thinking mode:
 * - { thinking: { type: "enabled" } }
 * - { thinking: { type: "disabled" } }
 *
 * When thinking is enabled, Moonshot only accepts tool_choice auto|none.
 * Normalize incompatible values to auto instead of failing the request.
 */
function createMoonshotThinkingWrapper(
  baseStreamFn: StreamFn | undefined,
  thinkingType?: MoonshotThinkingType,
): StreamFn {
  const underlying = baseStreamFn ?? streamSimple;
  return (model, context, options) => {
    const originalOnPayload = options?.onPayload;
    return underlying(model, context, {
      ...options,
      onPayload: (payload) => {
        if (payload && typeof payload === "object") {
          const payloadObj = payload as Record<string, unknown>;
          let effectiveThinkingType = normalizeMoonshotThinkingType(payloadObj.thinking);

          if (thinkingType) {
            payloadObj.thinking = { type: thinkingType };
            effectiveThinkingType = thinkingType;
          }

          if (
            effectiveThinkingType === "enabled" &&
            !isMoonshotToolChoiceCompatible(payloadObj.tool_choice)
          ) {
            payloadObj.tool_choice = "auto";
          }
        }
        originalOnPayload?.(payload);
      },
    });
  };
}

/**
 * Create a streamFn wrapper that adds OpenRouter app attribution headers.
 * These headers allow Hanzo Bot to appear on OpenRouter's leaderboard.
 */
function createOpenRouterHeadersWrapper(baseStreamFn: StreamFn | undefined): StreamFn {
  const underlying = baseStreamFn ?? streamSimple;
  return (model, context, options) =>
    underlying(model, context, {
      ...options,
      headers: {
        ...OPENROUTER_APP_HEADERS,
        ...options?.headers,
      },
    });
}

/**
 * Create a streamFn wrapper that injects OpenRouter reasoning.effort for
 * non-off thinkingLevel values.
 */
function createOpenRouterReasoningWrapper(
  baseStreamFn: StreamFn | undefined,
  thinkingLevel: string,
): StreamFn {
  const underlying = baseStreamFn ?? streamSimple;
  return (model, context, options) => {
    const originalOnPayload = options?.onPayload;
    return underlying(model, context, {
      ...options,
      onPayload: (payload) => {
        if (payload && typeof payload === "object") {
          const p = payload as Record<string, unknown>;
          // Remove legacy reasoning_effort regardless
          delete p.reasoning_effort;
          if (thinkingLevel !== "off") {
            // Only inject if reasoning doesn't already have max_tokens set
            const existing = p.reasoning as Record<string, unknown> | undefined;
            if (!existing || !existing.max_tokens) {
              p.reasoning = { effort: thinkingLevel };
            }
          } else {
            // When off, remove reasoning entirely
            delete p.reasoning;
          }
        }
        originalOnPayload?.(payload);
      },
    });
  };
}

/**
 * Create a streamFn wrapper that normalizes SiliconFlow Pro model thinking=off to null.
 */
function createSiliconFlowThinkingWrapper(
  baseStreamFn: StreamFn | undefined,
  modelId: string,
): StreamFn {
  const underlying = baseStreamFn ?? streamSimple;
  return (model, context, options) => {
    const originalOnPayload = options?.onPayload;
    return underlying(model, context, {
      ...options,
      onPayload: (payload) => {
        if (payload && typeof payload === "object") {
          const p = payload as Record<string, unknown>;
          if (p.thinking === "off" && modelId.startsWith("Pro/")) {
            p.thinking = null;
          }
        }
        originalOnPayload?.(payload);
      },
    });
  };
}

/**
 * Create a streamFn wrapper that sanitizes Google thinkingBudget values and
 * maps Gemini 3.1+ models to thinkingLevel.
 */
function createGoogleThinkingWrapper(
  baseStreamFn: StreamFn | undefined,
  thinkingLevel: string,
  modelId: string,
): StreamFn {
  const underlying = baseStreamFn ?? streamSimple;
  return (model, context, options) => {
    const originalOnPayload = options?.onPayload;
    return underlying(model, context, {
      ...options,
      onPayload: (payload) => {
        if (payload && typeof payload === "object") {
          const p = payload as Record<string, unknown>;
          const config = p.config as Record<string, unknown> | undefined;
          if (config?.thinkingConfig) {
            const tc = config.thinkingConfig as Record<string, unknown>;
            const budget = tc.thinkingBudget;
            if (typeof budget === "number" && budget < 0) {
              // Remove invalid negative thinkingBudget
              delete tc.thinkingBudget;
              // For Gemini 3.1+, map to thinkingLevel
              if (modelId.includes("gemini-3.1")) {
                tc.thinkingLevel = thinkingLevel.toUpperCase();
              }
            }
          }
        }
        originalOnPayload?.(payload);
      },
    });
  };
}

/**
 * Create a streamFn wrapper that disables prompt caching for non-Anthropic Bedrock models.
 */
function createBedrockCacheWrapper(
  baseStreamFn: StreamFn | undefined,
  modelId: string,
  extraParams: Record<string, unknown> | undefined,
): StreamFn {
  const underlying = baseStreamFn ?? streamSimple;
  const isAnthropicModel = modelId.includes("anthropic") || modelId.includes("claude");
  const explicitCacheRetention = extraParams?.cacheRetention;
  return (model, context, options) => {
    if (!isAnthropicModel && !explicitCacheRetention) {
      return underlying(model, context, {
        ...options,
        cacheRetention: "none",
      });
    }
    if (
      explicitCacheRetention === "none" ||
      explicitCacheRetention === "short" ||
      explicitCacheRetention === "long"
    ) {
      return underlying(model, context, {
        ...options,
        cacheRetention: explicitCacheRetention,
      });
    }
    return underlying(model, context, options);
  };
}

/**
 * Create a streamFn wrapper that adds Anthropic beta headers for context-1m
 * and other configured betas.
 */
function createAnthropicBetaWrapper(
  baseStreamFn: StreamFn | undefined,
  extraParams: Record<string, unknown> | undefined,
  modelId: string,
): StreamFn {
  const underlying = baseStreamFn ?? streamSimple;
  const context1m = extraParams?.context1m === true;
  const customBetas = Array.isArray(extraParams?.anthropicBeta)
    ? (extraParams.anthropicBeta as string[])
    : [];

  return (model, context, options) => {
    const isOpusSonnet = OPUS_SONNET_RE.test(modelId);
    const apiKey = (options as Record<string, unknown> | undefined)?.apiKey;
    const isOAuthToken = typeof apiKey === "string" && apiKey.startsWith("sk-ant-oat");

    // Determine what betas to add
    const willAddContext1m = context1m && isOpusSonnet;
    const hasCustomBetas = customBetas.length > 0;

    if (isOAuthToken) {
      // OAuth tokens always get OAuth-required betas
    } else if (!willAddContext1m && !hasCustomBetas) {
      // Nothing to add for non-OAuth, non-Opus/Sonnet without custom betas
      return underlying(model, context, options);
    }

    // Build the beta header values
    const existingBeta = options?.headers?.["anthropic-beta"];
    const parts: string[] = existingBeta ? existingBeta.split(",").map((s) => s.trim()) : [];

    if (isOAuthToken) {
      // For OAuth tokens, add OAuth-required betas and skip context-1m
      for (const beta of OAUTH_REQUIRED_BETAS) {
        if (!parts.includes(beta)) {
          parts.push(beta);
        }
      }
    } else {
      // For API keys, add pi-ai default betas alongside context1m / custom betas
      for (const beta of PI_AI_DEFAULT_BETAS) {
        if (!parts.includes(beta)) {
          parts.push(beta);
        }
      }
      // Add custom betas
      for (const beta of customBetas) {
        if (!parts.includes(beta)) {
          parts.push(beta);
        }
      }
      // Add context-1m if model is Opus/Sonnet
      if (willAddContext1m && !parts.includes(CONTEXT_1M_BETA)) {
        parts.push(CONTEXT_1M_BETA);
      }
    }

    if (parts.length === 0) {
      return underlying(model, context, options);
    }

    const headers = {
      ...options?.headers,
      "anthropic-beta": parts.join(","),
    };

    return underlying(model, context, {
      ...options,
      headers,
    });
  };
}

/**
 * Create a streamFn wrapper for Codex transport defaults.
 */
function createCodexTransportWrapper(
  baseStreamFn: StreamFn | undefined,
  extraParams: Record<string, unknown> | undefined,
): StreamFn {
  const underlying = baseStreamFn ?? streamSimple;
  const configured = extraParams?.transport as string | undefined;
  const validTransport = (
    configured && VALID_TRANSPORT_VALUES.has(configured) ? configured : "auto"
  ) as "auto" | "sse" | "websocket";

  return (model, context, options) => {
    // Runtime options override configured transport
    const runtime = (options as Record<string, unknown> | undefined)?.transport;
    if (runtime) {
      return underlying(model, context, options);
    }
    return underlying(model, context, {
      ...options,
      transport: validTransport,
    });
  };
}

/**
 * Apply extra params (like temperature) to an agent's streamFn.
 * Also adds OpenRouter app attribution headers when using the OpenRouter provider.
 *
 * @internal Exported for testing
 */
export function applyExtraParamsToAgent(
  agent: { streamFn?: StreamFn },
  cfg: BotConfig | undefined,
  provider: string,
  modelId: string,
  extraParamsOverride?: Record<string, unknown>,
  thinkingLevel?: string,
): void {
  const extraParams = resolveExtraParams({
    cfg,
    provider,
    modelId,
  });
  const override =
    extraParamsOverride && Object.keys(extraParamsOverride).length > 0
      ? Object.fromEntries(
          Object.entries(extraParamsOverride).filter(([, value]) => value !== undefined),
        )
      : undefined;
  const merged = Object.assign({}, extraParams, override);
  const wrappedStreamFn = createStreamFnWithExtraParams(agent.streamFn, merged, provider);

  if (wrappedStreamFn) {
    log.debug(`applying extraParams to agent streamFn for ${provider}/${modelId}`);
    agent.streamFn = wrappedStreamFn;
  }

  if (provider === "openrouter") {
    log.debug(`applying OpenRouter app attribution headers for ${provider}/${modelId}`);
    agent.streamFn = createOpenRouterHeadersWrapper(agent.streamFn);
    if (thinkingLevel) {
      agent.streamFn = createOpenRouterReasoningWrapper(agent.streamFn, thinkingLevel);
    }
  }

  if (provider === "siliconflow" && thinkingLevel === "off") {
    agent.streamFn = createSiliconFlowThinkingWrapper(agent.streamFn, modelId);
  }

  if (thinkingLevel && (provider === "atproxy" || provider === "google")) {
    agent.streamFn = createGoogleThinkingWrapper(agent.streamFn, thinkingLevel, modelId);
  }

  if (provider === "amazon-bedrock") {
    agent.streamFn = createBedrockCacheWrapper(agent.streamFn, modelId, merged);
  }

  if (provider === "anthropic") {
    agent.streamFn = createAnthropicBetaWrapper(agent.streamFn, merged, modelId);
  }

  if (provider === "openai-codex") {
    agent.streamFn = createCodexTransportWrapper(agent.streamFn, merged);
  }

  // Work around upstream pi-ai hardcoding `store: false` for Responses API.
  // Force `store=true` for direct OpenAI Responses models and auto-enable
  // server-side compaction for compatible OpenAI Responses payloads.
  agent.streamFn = createOpenAIResponsesContextManagementWrapper(agent.streamFn, merged);
}
