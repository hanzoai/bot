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
import { resolveSessionAgentId } from "../agents/agent-scope.js";
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

  // Bot wallet balance check — block if bot has an enabled wallet with $0 balance.
  const walletBotId = sessionKey.split(":")[0] ?? "";
  if (walletBotId.startsWith("cloud-")) {
    try {
      const { getWalletBalance } = await import("../gateway/billing/iam-billing-client.js");
      const walletBalance = await getWalletBalance(walletBotId);
      if (walletBalance >= 0 && walletBalance <= 0) {
        sendJson(res, 402, {
          ok: false,
          error: "Bot wallet has insufficient funds. Fund your bot wallet to continue.",
        });
        return true;
      }
    } catch {
      // Wallet check failed — don't gate (fail-open)
    }
  }

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

  // Collect final reply parts via the dispatcher's deliver callback.
  // dispatchInboundMessage is async and resolves when the agent run completes.
  const parts: string[] = [];
  const abortController = new AbortController();
  const timer = setTimeout(() => abortController.abort(), timeoutMs);

  const dispatcher = createReplyDispatcher({
    ...prefixOptions,
    onError: (err) => {
      // eslint-disable-next-line no-console
      console.error("[chat-bridge] dispatch error:", err);
    },
    deliver: async (payload, info) => {
      if (info.kind !== "final") return;
      const text = payload.text?.trim() ?? "";
      if (text) parts.push(text);
    },
  });

  try {
    await dispatchInboundMessage({
      ctx,
      cfg,
      dispatcher,
      replyOptions: {
        runId: clientRunId,
        abortSignal: abortController.signal,
        onAgentRunStart: () => {},
      },
    });
    clearTimeout(timer);

    const response = parts.join("\n");
    sendJson(res, 200, { ok: true, sessionKey, response });
  } catch (err) {
    clearTimeout(timer);
    const msg = err instanceof Error ? err.message : String(err);
    sendJson(res, 502, { ok: false, error: msg });
  }

  return true;
}
