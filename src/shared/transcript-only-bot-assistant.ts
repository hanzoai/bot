// Identifies Bot-authored assistant rows that are transcript bookkeeping,
// not provider model output. Some history surfaces keep gateway-injected rows
// visible, so use the narrower delivery-mirror predicate when visibility matters.
export const BOT_TRANSCRIPT_ARTIFACT_API = "bot-transcript" as const;
export const BOT_TRANSCRIPT_ARTIFACT_PROVIDER = "bot" as const;
export const BOT_DELIVERY_MIRROR_MODEL = "delivery-mirror" as const;
const BOT_GATEWAY_INJECTED_MODEL = "gateway-injected" as const;

const TRANSCRIPT_ONLY_BOT_ASSISTANT_MODELS = new Set<string>([
  BOT_DELIVERY_MIRROR_MODEL,
  BOT_GATEWAY_INJECTED_MODEL,
]);
const BOT_DELIVERY_MIRROR_KINDS = new Set([
  "channel-final",
  "channel-final-suppressed",
  "message-tool-source-reply",
]);

function isBotDeliveryMirrorMarker(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const kind = (value as { kind?: unknown }).kind;
  return typeof kind === "string" && BOT_DELIVERY_MIRROR_KINDS.has(kind);
}

export function isTranscriptOnlyBotAssistantModel(provider: unknown, model: unknown): boolean {
  return (
    provider === BOT_TRANSCRIPT_ARTIFACT_PROVIDER &&
    typeof model === "string" &&
    TRANSCRIPT_ONLY_BOT_ASSISTANT_MODELS.has(model)
  );
}

/**
 * Returns true when the message is an Bot-authored transcript artifact
 * that must not be replayed to providers.
 *
 * Primary check: provider="bot" + model in known transcript-only set.
 * Fallback: a valid botDeliveryMirror marker catches observed historical
 * rows whose provider/model provenance was stripped (#99470).
 */
export function isTranscriptOnlyBotAssistantMessage(message: unknown): boolean {
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    return false;
  }
  const entry = message as {
    role?: unknown;
    provider?: unknown;
    model?: unknown;
    botDeliveryMirror?: unknown;
  };
  if (entry.role !== "assistant") {
    return false;
  }
  if (isTranscriptOnlyBotAssistantModel(entry.provider, entry.model)) {
    return true;
  }
  return isBotDeliveryMirrorMarker(entry.botDeliveryMirror);
}

export function isBotMessageToolMirrorAssistantMessage(message: unknown): boolean {
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    return false;
  }
  const entry = message as { role?: unknown; botMessageToolMirror?: unknown };
  return entry.role === "assistant" && entry.botMessageToolMirror !== undefined;
}

export function isBotInternalSourceReplyMirrorAssistantMessage(message: unknown): boolean {
  if (!isBotMessageToolMirrorAssistantMessage(message)) {
    return false;
  }
  const marker = (message as { botMessageToolMirror?: unknown }).botMessageToolMirror;
  return (
    Boolean(marker) &&
    typeof marker === "object" &&
    !Array.isArray(marker) &&
    (marker as { sourceReplySink?: unknown }).sourceReplySink === "internal-ui"
  );
}

export function isBotDeliveryMirrorAssistantMessage(message: unknown): boolean {
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    return false;
  }
  const entry = message as { role?: unknown; provider?: unknown; model?: unknown };
  return (
    entry.role === "assistant" &&
    entry.provider === BOT_TRANSCRIPT_ARTIFACT_PROVIDER &&
    entry.model === BOT_DELIVERY_MIRROR_MODEL
  );
}
