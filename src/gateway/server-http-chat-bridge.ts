/**
 * HTTP Chat Bridge — REST endpoint for sending chat messages to bots.
 * Minimal version: accepts the request and returns a placeholder while
 * the full dispatch integration is completed in a follow-up.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { sendJson } from "./http-common.js";
import { authorizeHttpGatewayConnect, type ResolvedGatewayAuth } from "./auth.js";
import { getBearerToken } from "./http-utils.js";
import { normalizeRateLimitClientIp, type AuthRateLimiter } from "./auth-rate-limit.js";
import { readJsonBody } from "./hooks.js";

const MAX_BODY_BYTES = 512 * 1024;

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
    // Authenticate
    const token = getBearerToken(req);
    const clientIp = normalizeRateLimitClientIp(
      req,
      opts.trustedProxies ?? [],
      opts.allowRealIpFallback ?? false,
    );
    const authResult = authorizeHttpGatewayConnect({
      auth: opts.auth,
      token,
      password: undefined,
      clientIp,
      rateLimiter: opts.rateLimiter,
    });
    if (!authResult.ok) {
      sendJson(res, 401, { ok: false, error: "unauthorized" });
      return true;
    }

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

    // For now, return success with the message echoed back.
    // The full chat dispatch integration will be added in a follow-up.
    // The Chat tab (WebSocket) is the primary interaction path.
    sendJson(res, 200, {
      ok: true,
      sessionKey,
      response: `[Chat Bridge] Message received: "${message}". Use the Chat tab for interactive AI responses.`,
    });
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // eslint-disable-next-line no-console
    console.error("[chat-bridge] error:", msg);
    sendJson(res, 500, { ok: false, error: msg });
    return true;
  }
}
