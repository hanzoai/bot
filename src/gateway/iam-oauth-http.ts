/**
 * OAuth2 proxy endpoints for IAM auth mode.
 *
 * These routes keep the OAuth client_secret server-side while exposing
 * a clean auth flow for browser clients:
 *
 *   GET  /auth/login    → redirect to IAM authorize endpoint (PKCE)
 *   GET  /auth/callback → exchange code for tokens
 *   POST /auth/refresh  → refresh access token
 *   POST /auth/logout   → clear session (client-side)
 *   GET  /auth/userinfo → proxy to IAM userinfo
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { GatewayIamConfig } from "../config/types.gateway.js";
import { getIamClient } from "./auth-iam.js";

const AUTH_PREFIX = "/auth";

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage, maxBytes = 16_384): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) {
        req.destroy();
        reject(new Error("body too large"));
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

function getQueryParam(req: IncomingMessage, name: string): string | null {
  const url = new URL(req.url ?? "/", "http://localhost");
  return url.searchParams.get(name);
}

function getBearerToken(req: IncomingMessage): string | null {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) {
    return null;
  }
  return auth.slice(7).trim() || null;
}

/**
 * Handle IAM OAuth HTTP requests.
 * Returns true if the request was handled, false to pass through.
 */
export async function handleIamOAuthHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  config: GatewayIamConfig,
): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const pathname = url.pathname;

  if (!pathname.startsWith(AUTH_PREFIX)) {
    return false;
  }

  const subPath = pathname.slice(AUTH_PREFIX.length);

  // CORS headers for browser clients
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin ?? "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.setHeader("Access-Control-Allow-Credentials", "true");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return true;
  }

  try {
    switch (subPath) {
      case "/login":
        return await handleLogin(req, res, config);
      case "/callback":
        return await handleCallback(req, res, config);
      case "/refresh":
        return await handleRefresh(req, res, config);
      case "/logout":
        return handleLogout(req, res);
      case "/userinfo":
        return await handleUserinfo(req, res, config);
      default:
        return false;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    sendJson(res, 500, { error: message });
    return true;
  }
}

// ---------------------------------------------------------------------------
// GET /auth/login — redirect to IAM authorize endpoint
// ---------------------------------------------------------------------------

async function handleLogin(
  req: IncomingMessage,
  res: ServerResponse,
  config: GatewayIamConfig,
): Promise<boolean> {
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed" });
    return true;
  }

  const redirectUri = getQueryParam(req, "redirect_uri");
  if (!redirectUri) {
    sendJson(res, 400, { error: "Missing redirect_uri parameter" });
    return true;
  }

  const state = getQueryParam(req, "state") ?? crypto.randomUUID();
  const scope = getQueryParam(req, "scope") ?? config.scopes?.join(" ") ?? "openid profile email";
  const codeChallenge = getQueryParam(req, "code_challenge");
  const codeChallengeMethod = getQueryParam(req, "code_challenge_method");

  const client = getIamClient(config);
  const authUrl = await client.getAuthorizationUrl({
    redirectUri,
    state,
    scope,
    codeChallenge: codeChallenge ?? undefined,
    codeChallengeMethod: codeChallengeMethod ?? undefined,
  });

  res.statusCode = 302;
  res.setHeader("Location", authUrl);
  res.end();
  return true;
}

// ---------------------------------------------------------------------------
// GET /auth/callback — exchange code for tokens
// ---------------------------------------------------------------------------

async function handleCallback(
  req: IncomingMessage,
  res: ServerResponse,
  config: GatewayIamConfig,
): Promise<boolean> {
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed" });
    return true;
  }

  const code = getQueryParam(req, "code");
  if (!code) {
    const error = getQueryParam(req, "error");
    const desc = getQueryParam(req, "error_description");
    sendJson(res, 400, { error: desc ?? error ?? "Missing authorization code" });
    return true;
  }

  const redirectUri = getQueryParam(req, "redirect_uri");
  if (!redirectUri) {
    sendJson(res, 400, { error: "Missing redirect_uri parameter" });
    return true;
  }

  const codeVerifier = getQueryParam(req, "code_verifier") ?? undefined;
  const client = getIamClient(config);
  const tokens = await client.exchangeCode({
    code,
    redirectUri,
    codeVerifier,
  });

  sendJson(res, 200, tokens);
  return true;
}

// ---------------------------------------------------------------------------
// POST /auth/refresh — refresh access token
// ---------------------------------------------------------------------------

async function handleRefresh(
  req: IncomingMessage,
  res: ServerResponse,
  config: GatewayIamConfig,
): Promise<boolean> {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return true;
  }

  let refreshToken: string | undefined;

  const contentType = req.headers["content-type"] ?? "";
  if (contentType.includes("application/json")) {
    const body = JSON.parse(await readBody(req)) as { refresh_token?: string };
    refreshToken = body.refresh_token;
  }

  if (!refreshToken) {
    sendJson(res, 400, { error: "Missing refresh_token" });
    return true;
  }

  const client = getIamClient(config);
  const tokens = await client.refreshToken(refreshToken);

  sendJson(res, 200, tokens);
  return true;
}

// ---------------------------------------------------------------------------
// POST /auth/logout — client-side logout signal
// ---------------------------------------------------------------------------

function handleLogout(_req: IncomingMessage, res: ServerResponse): boolean {
  // Server-side: nothing to revoke currently (Casdoor doesn't support
  // standard token revocation out of the box). Client clears tokens.
  sendJson(res, 200, { ok: true });
  return true;
}

// ---------------------------------------------------------------------------
// GET /auth/userinfo — proxy to IAM userinfo endpoint
// ---------------------------------------------------------------------------

async function handleUserinfo(
  req: IncomingMessage,
  res: ServerResponse,
  config: GatewayIamConfig,
): Promise<boolean> {
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed" });
    return true;
  }

  const token = getBearerToken(req);
  if (!token) {
    sendJson(res, 401, { error: "Missing Bearer token" });
    return true;
  }

  const client = getIamClient(config);
  const userInfo = await client.getUserInfo(token);
  sendJson(res, 200, userInfo);
  return true;
}
