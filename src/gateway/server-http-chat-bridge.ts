/**
 * HTTP Chat Bridge — REST endpoint for sending chat messages to bots.
 *
 * POST /api/v1/chat
 * { "sessionKey": "cloud-xxx:main", "message": "Hello", "timeoutMs": 60000 }
 *
 * Returns: { "ok": true, "response": "Hi!" }
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { loadConfig } from "../config/config.js";
import { dispatchInboundMessage } from "../auto-reply/dispatch.js";
import { createReplyDispatcher } from "../auto-reply/reply/reply-dispatcher.js";
import { createReplyPrefixOptions } from "../channels/reply-prefix.js";
import { resolveSessionAgentId } from "../config/sessions.js";
import { INTERNAL_MESSAGE_CHANNEL } from "../utils/message-channel.js";
import type { MsgContext } from "../auto-reply/templating.js";
import { sendJson } from "./http-common.js";
import type { ResolvedGatewayAuth } from "./auth.js";
import type { AuthRateLimiter } from "./auth-rate-limit.js";
import { readJsonBody } from "./hooks.js";

const MAX_BODY_BYTES = 512 * 1024;
const DEFAULT_TIMEOUT_MS = 120_000;

export async function handleChatBridgeHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  opts: {
    auth: ResolvedGatewayAuth;
    trustedProxies?: string[];
    allowRealIpFallback?: boolean;
    rateLimiter?: AuthRateLimiter;
  },
): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://localhost");

  if (url.pathname !== "/api/v1/chat" || req.method !== "POST") {
    return false;
  }

  try {
    return await handleChatBridge(req, res);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // eslint-disable-next-line no-console
    console.error("[chat-bridge] error:", msg);
    sendJson(res, 500, { ok: false, error: msg });
    return true;
  }
}

async function handleChatBridge(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  // Read body
  const bodyResult = await readJsonBody(req, MAX_BODY_BYTES);
  if (!bodyResult.ok) {
    sendJson(res, 400, { ok: false, error: bodyResult.error });
    return true;
  }

  const body = bodyResult.value as Record<string, unknown>;
  const message = String(body.message ?? "").trim();
  if (!message) {
    sendJson(res, 400, { ok: false, error: "message is required" });
    return true;
  }

  const nodeId = String(body.nodeId ?? "");
  const sessionKey = String(body.sessionKey || (nodeId ? `${nodeId}:main` : ""));
  if (!sessionKey) {
    sendJson(res, 400, { ok: false, error: "sessionKey or nodeId is required" });
    return true;
  }

  const timeoutMs = Number(body.timeoutMs) || DEFAULT_TIMEOUT_MS;
  const cfg = loadConfig();
  const clientRunId = randomUUID();

  // Build MsgContext — same pattern as chat.send in server-methods/chat.ts
  const ctx: MsgContext = {
    Body: message,
    BodyForAgent: message,
    RawBody: message,
    CommandBody: message,
    BodyForCommands: message,
    SessionKey: sessionKey,
    Provider: INTERNAL_MESSAGE_CHANNEL,
    Surface: INTERNAL_MESSAGE_CHANNEL,
    ChatType: "direct",
    CommandAuthorized: true,
    MessageSid: clientRunId,
    SenderId: "http-bridge",
    SenderName: "HTTP Bridge",
    SenderUsername: "http-bridge",
  };

  const agentId = resolveSessionAgentId({ sessionKey, config: cfg });
  const { onModelSelected, ...prefixOptions } = createReplyPrefixOptions({
    cfg,
    agentId,
    channel: INTERNAL_MESSAGE_CHANNEL,
  });

  // Collect the final reply via a promise — mirrors chat.send pattern
  const replyPromise = new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);
    const parts: string[] = [];

    const dispatcher = createReplyDispatcher({
      ...prefixOptions,
      onError: (err) => {
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      },
      deliver: async (payload, info) => {
        if (info.kind !== "final") return;
        const text = payload.text?.trim() ?? "";
        if (text) parts.push(text);
      },
    });

    const abortController = new AbortController();

    void dispatchInboundMessage({
      ctx,
      cfg,
      dispatcher,
      replyOptions: {
        runId: clientRunId,
        abortSignal: abortController.signal,
        onAgentRunStart: () => {},
        onAgentRunComplete: () => {
          clearTimeout(timer);
          resolve(parts.join("\n"));
        },
      },
    }).catch((err) => {
      clearTimeout(timer);
      reject(err);
    });
  });

  try {
    const response = await replyPromise;
    sendJson(res, 200, { ok: true, sessionKey, response });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    sendJson(res, 502, { ok: false, error: msg });
  }

  return true;
}
