import type { detectOpenAICompletionsCompat } from "@hanzo/bot-ai/transports";
import type { ProviderEndpointClass } from "./provider-attribution.js";
import "@hanzo/bot-ai/transports";

type OpenAICompletionsCompatDefaultsInput = {
  provider?: string;
  endpointClass: ProviderEndpointClass;
  knownProviderFamily: string;
  supportsNativeStreamingUsageCompat?: boolean;
  supportsOpenAICompletionsStreamingUsageCompat?: boolean;
  usesExplicitProxyLikeEndpoint?: boolean;
};

type OpenAICompletionsCompatDefaults = ReturnType<typeof detectOpenAICompletionsCompat>["defaults"];

type OpenAICompletionsCompatTestApi = {
  resolveOpenAICompletionsCompatDefaults(
    input: OpenAICompletionsCompatDefaultsInput,
  ): OpenAICompletionsCompatDefaults;
};

function getTestApi(): OpenAICompletionsCompatTestApi {
  const api = (globalThis as Record<PropertyKey, unknown>)[
    Symbol.for("bot.openAICompletionsCompatTestApi")
  ];
  if (!api) {
    throw new Error("OpenAI completions compat test API is unavailable");
  }
  return api as OpenAICompletionsCompatTestApi;
}

export function resolveOpenAICompletionsCompatDefaults(
  input: OpenAICompletionsCompatDefaultsInput,
): OpenAICompletionsCompatDefaults {
  return getTestApi().resolveOpenAICompletionsCompatDefaults(input);
}
