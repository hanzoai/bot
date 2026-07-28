// Fireworks plugin module implements stream behavior.
import type { StreamFn } from "bot/plugin-sdk/agent-core";
import { streamSimple } from "bot/plugin-sdk/llm";
import type { ProviderWrapStreamFnContext } from "bot/plugin-sdk/plugin-entry";
import { normalizeProviderId } from "bot/plugin-sdk/provider-model-shared";
import { streamWithPayloadPatch } from "bot/plugin-sdk/provider-stream-shared";
import { isFireworksKimiModelId } from "./model-id.js";

function isFireworksProviderId(providerId: string): boolean {
  const normalized = normalizeProviderId(providerId);
  return normalized === "fireworks" || normalized === "fireworks-ai";
}

function createFireworksKimiThinkingDisabledWrapper(baseStreamFn: StreamFn | undefined): StreamFn {
  const underlying = baseStreamFn ?? streamSimple;
  return (model, context, options) =>
    streamWithPayloadPatch(underlying, model, context, options, (payloadObj) => {
      // Fireworks Kimi can emit chain-of-thought in visible `content` unless
      // the Anthropic-style thinking toggle is explicitly disabled.
      payloadObj.thinking = { type: "disabled" };
      delete payloadObj.reasoning;
      delete payloadObj.reasoning_effort;
      delete payloadObj.reasoningEffort;
    });
}

export function wrapFireworksProviderStream(
  ctx: ProviderWrapStreamFnContext,
): StreamFn | undefined {
  if (
    !isFireworksProviderId(ctx.provider) ||
    ctx.model?.api !== "openai-completions" ||
    !isFireworksKimiModelId(ctx.modelId)
  ) {
    return undefined;
  }
  return createFireworksKimiThinkingDisabledWrapper(ctx.streamFn);
}
