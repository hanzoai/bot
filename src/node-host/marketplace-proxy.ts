/**
 * Marketplace proxy — handles incoming proxy requests on the seller's node.
 *
 * When the gateway routes a buyer's request to this node, this module:
 * 1. Reads the seller's API key from config/env (HANZO_API_KEY preferred)
 * 2. Calls the Hanzo AI API (api.hanzo.ai) which routes to the appropriate model
 * 3. Streams chunks back via node.event (same relay pattern as VNC tunnel)
 * 4. Sends a final done event with token usage
 *
 * API priority:
 *   HANZO_API_KEY + api.hanzo.ai → primary (Hanzo Cloud, all models)
 *   ANTHROPIC_API_KEY + api.anthropic.com → explicit fallback only
 *
 * Privacy: prompts are held in memory only during the API call, never logged to disk.
 */
import type { GatewayClient } from "../gateway/client.js";
import type { NodeHostMarketplaceConfig } from "./config.js";

export type MarketplaceProxyRequest = {
  requestId: string;
  model: string;
  messages: Array<{ role: string; content: unknown }>;
  stream: boolean;
  maxTokens?: number;
  temperature?: number;
  system?: string;
};

type UsageInfo = {
  input_tokens: number;
  output_tokens: number;
};

/** Hanzo AI API — supports Anthropic Messages format via /v1/messages. */
const HANZO_API_URL = "https://api.hanzo.ai/v1/messages";
/** Anthropic direct API — only used when ANTHROPIC_API_KEY is explicitly set. */
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";

type ResolvedApi = {
  url: string;
  apiKey: string;
  /** Header name for the API key. */
  keyHeader: string;
  /** Label for error messages. */
  label: string;
};

/**
 * Resolve which API endpoint and key to use.
 * Priority: config.claudeApiKey → HANZO_API_KEY → ANTHROPIC_API_KEY (fallback).
 */
function resolveApi(config: NodeHostMarketplaceConfig): ResolvedApi | null {
  const hanzoKey = config.claudeApiKey || process.env.HANZO_API_KEY || process.env.HANZO_ACCESS_KEY;
  if (hanzoKey) {
    return {
      url: process.env.HANZO_API_URL?.trim() || HANZO_API_URL,
      apiKey: hanzoKey,
      keyHeader: "x-api-key",
      label: "Hanzo API",
    };
  }

  // Explicit fallback: only if the user has set ANTHROPIC_API_KEY directly.
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) {
    return {
      url: ANTHROPIC_API_URL,
      apiKey: anthropicKey,
      keyHeader: "x-api-key",
      label: "Anthropic API",
    };
  }

  return null;
}

/**
 * Handle a marketplace proxy request using the seller's API key.
 * Caller is responsible for sending the initial invoke result (ok: true).
 */
export async function handleMarketplaceProxy(
  request: MarketplaceProxyRequest,
  config: NodeHostMarketplaceConfig,
  client: GatewayClient,
): Promise<void> {
  const api = resolveApi(config);
  if (!api) {
    sendProxyError(
      client,
      request.requestId,
      "NO_API_KEY",
      "no API key configured (set HANZO_API_KEY or claudeApiKey in marketplace config)",
    );
    return;
  }

  const startMs = Date.now();
  const body: Record<string, unknown> = {
    model: request.model,
    messages: request.messages,
    max_tokens: request.maxTokens ?? 4096,
    stream: request.stream,
  };
  if (request.temperature !== undefined) {
    body.temperature = request.temperature;
  }
  if (request.system) {
    body.system = request.system;
  }

  try {
    const response = await fetch(api.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [api.keyHeader]: api.apiKey,
        "anthropic-version": API_VERSION,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => "");
      sendProxyError(
        client,
        request.requestId,
        `HTTP_${response.status}`,
        `${api.label} ${response.status}: ${errBody.substring(0, 200)}`,
      );
      return;
    }

    if (request.stream) {
      await handleStreamingResponse(client, request.requestId, response, startMs, request.model);
    } else {
      await handleNonStreamingResponse(client, request.requestId, response, startMs, request.model);
    }
  } catch (err) {
    sendProxyError(
      client,
      request.requestId,
      "FETCH_ERROR",
      `Failed to call ${api.label}: ${String(err)}`,
    );
  }
}

async function handleStreamingResponse(
  client: GatewayClient,
  requestId: string,
  response: Response,
  startMs: number,
  model: string,
): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) {
    sendProxyError(client, requestId, "NO_BODY", "no response body");
    return;
  }

  const decoder = new TextDecoder();
  let inputTokens = 0;
  let outputTokens = 0;
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      // Keep the last partial line in the buffer.
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) {
          continue;
        }
        const data = line.substring(6);
        if (data === "[DONE]") {
          continue;
        }

        // Extract usage from message_start and message_delta events.
        try {
          const parsed = JSON.parse(data);
          if (parsed.type === "message_start" && parsed.message?.usage) {
            inputTokens = parsed.message.usage.input_tokens ?? 0;
          }
          if (parsed.type === "message_delta" && parsed.usage) {
            outputTokens = parsed.usage.output_tokens ?? 0;
          }
        } catch {
          // Not all data lines are JSON — some are just text chunks.
        }

        // Relay the SSE data line to the gateway.
        sendProxyChunk(client, requestId, data);
      }
    }
  } finally {
    reader.releaseLock();
  }

  sendProxyDone(client, requestId, model, inputTokens, outputTokens, Date.now() - startMs);
}

async function handleNonStreamingResponse(
  client: GatewayClient,
  requestId: string,
  response: Response,
  startMs: number,
  model: string,
): Promise<void> {
  const text = await response.text();

  let inputTokens = 0;
  let outputTokens = 0;
  try {
    const parsed = JSON.parse(text);
    const usage = parsed.usage as UsageInfo | undefined;
    if (usage) {
      inputTokens = usage.input_tokens ?? 0;
      outputTokens = usage.output_tokens ?? 0;
    }
  } catch {
    // If we can't parse, still send the raw response.
  }

  // Send the full response as a single chunk.
  sendProxyChunk(client, requestId, text, true);
  sendProxyDone(client, requestId, model, inputTokens, outputTokens, Date.now() - startMs);
}

function sendProxyChunk(
  client: GatewayClient,
  requestId: string,
  data: string,
  done?: boolean,
): void {
  try {
    void client.request("node.event", {
      event: "marketplace.proxy.chunk",
      payloadJSON: JSON.stringify({ requestId, data, done }),
    });
  } catch {
    // Best effort — gateway may be disconnected.
  }
}

function sendProxyDone(
  client: GatewayClient,
  requestId: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
  durationMs: number,
): void {
  try {
    void client.request("node.event", {
      event: "marketplace.proxy.done",
      payloadJSON: JSON.stringify({
        requestId,
        model,
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        durationMs,
      }),
    });
  } catch {
    // Best effort.
  }
}

function sendProxyError(
  client: GatewayClient,
  requestId: string,
  code: string,
  message: string,
): void {
  try {
    void client.request("node.event", {
      event: "marketplace.proxy.error",
      payloadJSON: JSON.stringify({ requestId, code, message }),
    });
  } catch {
    // Best effort.
  }
}
