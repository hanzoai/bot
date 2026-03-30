/**
 * HTTP Chat Bridge — REST endpoint for sending chat messages to bots.
 *
 * POST /api/v1/chat
 * Authorization: Bearer <gateway-token>
 * Content-Type: application/json
 *
 * { "sessionKey": "cloud-xxx:main", "message": "Hello", "timeoutMs": 60000 }
 *
 * Returns: { "ok": true, "response": "Hi! How can I help?" }
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { loadConfig } from "../config/config.js";
import { dispatchInboundMessage } from "../auto-reply/dispatch.js";
import { createReplyDispatcher, createReplyPrefixOptions } from "../auto-reply/reply.js";
import type { ChatImageContent } from "../auto-reply/types.js";
import { resolveSessionAgentId } from "../config/sessions.js";
import { INTERNAL_MESSAGE_CHANNEL } from "../utils/message-channel.js";
import type { MsgContext } from "../utils/message-types.js";
import { authorizeHttpGatewayConnect, type ResolvedGatewayAuth } from "./auth.js";
import { readJsonBodyOrError, sendGatewayAuthFailure, sendJson } from "./http-common.js";
import { getBearerToken } from "./http-utils.js";
import type { AuthRateLimiter } from "./auth-rate-limit.js";
import { normalizeRateLimitClientIp } from "./auth-rate-limit.js";

const MAX_BODY_BYTES = 512 * 1024; // 512 KB
const DEFAULT_TIMEOUT_MS = 120_000; // 2 minutes

type ChatBridgeBody = {
  sessionKey: string;
  message: string;
  nodeId?: string;
  model?: string;
  timeoutMs?: number;
};

export function handleChatBridgeHttpRequest(
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

  // Only handle POST /api/v1/chat
  if (url.pathname !== "/api/v1/chat" || req.method !== "POST") {
    return Promise.resolve(false);
  }

  return handleChatBridge(req, res, opts);
}

async function handleChatBridge(
  req: IncomingMessage,
  res: ServerResponse,
  opts: {
    auth: ResolvedGatewayAuth;
    trustedProxies?: string[];
    allowRealIpFallback?: boolean;
    rateLimiter?: AuthRateLimiter;
  },
): Promise<boolean> {
  // Authenticate
  const token = getBearerToken(req);
  const clientIp = normalizeRateLimitClientIp(req, opts.trustedProxies ?? [], opts.allowRealIpFallback ?? false);
  const authResult = authorizeHttpGatewayConnect({
    auth: opts.auth,
    token,
    password: undefined,
    clientIp,
    rateLimiter: opts.rateLimiter,
  });
  if (!authResult.ok) {
    sendGatewayAuthFailure(res, authResult);
    return true;
  }

  // Read body
  const bodyResult = await readJsonBodyOrError<ChatBridgeBody>(req, res, MAX_BODY_BYTES);
  if (!bodyResult) {
    return true; // Error already sent
  }

  const body = bodyResult;
  const message = (body.message ?? "").trim();
  if (!message) {
    sendJson(res, 400, { ok: false, error: "message is required" });
    return true;
  }

  // Build session key
  const sessionKey = body.sessionKey || (body.nodeId ? `${body.nodeId}:main` : "");
  if (!sessionKey) {
    sendJson(res, 400, { ok: false, error: "sessionKey or nodeId is required" });
    return true;
  }

  const timeoutMs = body.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const cfg = loadConfig();
  const clientRunId = randomUUID();

  // Build message context
  const ctx: MsgContext = {
    SessionKey: sessionKey,
    Body: message,
    Channel: INTERNAL_MESSAGE_CHANNEL,
    Sender: `http-bridge-${clientIp}`,
    AccountId: "",
    MessageThreadId: "",
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

  // Collect the final reply via a promise
  const replyPromise = new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`chat response timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    const finalParts: string[] = [];
    const dispatcher = createReplyDispatcher({
      ...prefixOptions,
      onError: (err) => {
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      },
      deliver: async (payload, info) => {
        if (info.kind !== "final") {
          return;
        }
        const text = payload.text?.trim() ?? "";
        if (text) {
          finalParts.push(text);
        }
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
          resolve(finalParts.join("\n"));
        },
      },
    });
  });

  try {
    const response = await replyPromise;
    sendJson(res, 200, { ok: true, sessionKey, response });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    sendJson(res, 502, { ok: false, error: errMsg });
  }

  return true;
}
