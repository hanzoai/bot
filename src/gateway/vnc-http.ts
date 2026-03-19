import type { IncomingMessage, ServerResponse } from "node:http";
import { loadConfig } from "../config/config.js";
import type { AuthRateLimiter } from "./auth-rate-limit.js";
import { authorizeHttpGatewayConnect, type ResolvedGatewayAuth } from "./auth.js";
import { sendGatewayAuthFailure, sendJson, sendText } from "./http-common.js";
import { getBearerToken } from "./http-utils.js";
import { renderVncViewer, verifyVncToken } from "./server-methods/vnc.js";

const VNC_VIEWER_PATH_PREFIX = "/api/vnc/";

function resolveNodeIdFromPath(pathname: string): string | null {
  if (!pathname.startsWith(VNC_VIEWER_PATH_PREFIX)) {
    return null;
  }
  const raw = pathname.slice(VNC_VIEWER_PATH_PREFIX.length);
  // Reject paths with additional segments (e.g. /api/vnc/node/extra).
  if (raw.includes("/") || !raw) {
    return null;
  }
  try {
    return decodeURIComponent(raw).trim() || null;
  } catch {
    return null;
  }
}

export async function handleVncHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  opts: {
    auth: ResolvedGatewayAuth;
    trustedProxies?: string[];
    allowRealIpFallback?: boolean;
    rateLimiter?: AuthRateLimiter;
  },
): Promise<boolean> {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const nodeId = resolveNodeIdFromPath(url.pathname);
  if (!nodeId) {
    return false;
  }

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    sendText(res, 405, "Method Not Allowed");
    return true;
  }

  const token = url.searchParams.get("token")?.trim() ?? "";
  if (!token) {
    sendJson(res, 401, {
      error: { message: "VNC token required (pass ?token=...)", type: "unauthorized" },
    });
    return true;
  }

  const verified = verifyVncToken(token);
  if (!verified) {
    sendJson(res, 401, {
      error: { message: "Invalid or expired VNC token", type: "unauthorized" },
    });
    return true;
  }

  if (verified.nodeId !== nodeId) {
    sendJson(res, 403, {
      error: { message: "Token does not match requested node", type: "forbidden" },
    });
    return true;
  }

  // Additionally verify that the caller has valid gateway auth so that
  // the VNC viewer cannot be reached by unauthenticated parties even if
  // they somehow obtain a valid VNC token.
  const cfg = loadConfig();
  const bearerToken = getBearerToken(req);
  const authResult = await authorizeHttpGatewayConnect({
    auth: opts.auth,
    connectAuth: bearerToken ? { token: bearerToken, password: bearerToken } : null,
    req,
    trustedProxies: opts.trustedProxies ?? cfg.gateway?.trustedProxies,
    allowRealIpFallback: opts.allowRealIpFallback ?? cfg.gateway?.allowRealIpFallback,
    rateLimiter: opts.rateLimiter,
  });
  if (!authResult.ok) {
    sendGatewayAuthFailure(res, authResult);
    return true;
  }

  const protocol = req.headers["x-forwarded-proto"] === "https" ? "wss" : "ws";
  const host = req.headers.host ?? "localhost";
  const wsUrl = `${protocol}://${host}/api/vnc/${encodeURIComponent(nodeId)}/ws?token=${encodeURIComponent(token)}`;
  const password = url.searchParams.get("password") ?? undefined;

  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(renderVncViewer(wsUrl, password));
  return true;
}
