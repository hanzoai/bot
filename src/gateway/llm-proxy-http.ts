/**
 * LLM Proxy HTTP Handler
 *
 * Forwards requests to an upstream LLM provider (OpenAI-compatible or Anthropic)
 * without going through the bot's agent system. Acts as a transparent proxy
 * with gateway auth enforcement.
 *
 * Endpoints:
 *   POST /v1/completions        — Legacy OpenAI completions
 *   POST /v1/embeddings         — OpenAI embeddings
 *   GET  /v1/models             — List available models
 *   POST /v1/messages           — Anthropic Messages API
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { createSubsystemLogger } from "../logging/subsystem.js";
import type { AuthRateLimiter } from "./auth-rate-limit.js";
import type { ResolvedGatewayAuth } from "./auth.js";
import { authorizeGatewayBearerRequestOrReply } from "./http-auth-helpers.js";
import { readJsonBodyOrError, sendJson, sendMethodNotAllowed } from "./http-common.js";
import { getBearerToken } from "./http-utils.js";

const log = createSubsystemLogger("llm-proxy");

export type LlmProxyHttpOptions = {
  auth: ResolvedGatewayAuth;
  trustedProxies?: string[];
  allowRealIpFallback?: boolean;
  rateLimiter?: AuthRateLimiter;
};

const DEFAULT_UPSTREAM_URL = "https://api.hanzo.ai";
const MAX_PROXY_BODY_BYTES = 20 * 1024 * 1024;

/** Resolve the upstream base URL, stripping trailing slashes. */
function resolveUpstreamBaseUrl(): string {
  const envUrl = process.env.OPENAI_BASE_URL?.trim() || process.env.LLM_BASE_URL?.trim();
  const base = envUrl || DEFAULT_UPSTREAM_URL;
  return base.replace(/\/+$/, "");
}

/** Extract the upstream API key from environment or fall through to caller's bearer token. */
function resolveUpstreamApiKey(callerToken: string | undefined): string | undefined {
  return process.env.OPENAI_API_KEY?.trim() || process.env.LLM_API_KEY?.trim() || callerToken;
}

const PROXY_POST_PATHS = new Set(["/v1/completions", "/v1/embeddings", "/v1/messages"]);
const PROXY_GET_PATHS = new Set(["/v1/models"]);

function isProxyPath(pathname: string): boolean {
  return PROXY_POST_PATHS.has(pathname) || PROXY_GET_PATHS.has(pathname);
}

async function authorizeRequest(
  req: IncomingMessage,
  res: ServerResponse,
  opts: LlmProxyHttpOptions,
): Promise<boolean> {
  return authorizeGatewayBearerRequestOrReply({
    req,
    res,
    auth: opts.auth,
    trustedProxies: opts.trustedProxies,
    allowRealIpFallback: opts.allowRealIpFallback,
    rateLimiter: opts.rateLimiter,
  });
}

/**
 * Build upstream request headers. For Anthropic /v1/messages, use x-api-key.
 * For OpenAI-compatible endpoints, use Authorization: Bearer.
 */
function buildUpstreamHeaders(
  pathname: string,
  apiKey: string | undefined,
  contentType?: string,
): Record<string, string> {
  const headers: Record<string, string> = {};

  if (contentType) {
    headers["content-type"] = contentType;
  }

  if (pathname === "/v1/messages") {
    // Anthropic Messages API uses x-api-key header and anthropic-version
    if (apiKey) {
      headers["x-api-key"] = apiKey;
    }
    headers["anthropic-version"] = "2023-06-01";
  } else {
    if (apiKey) {
      headers["authorization"] = `Bearer ${apiKey}`;
    }
  }

  return headers;
}

/**
 * Proxy a POST request body to the upstream LLM provider and stream the response back.
 */
async function proxyPostRequest(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  callerToken: string | undefined,
): Promise<void> {
  const body = await readJsonBodyOrError(req, res, MAX_PROXY_BODY_BYTES);
  if (body === undefined) {
    // readJsonBodyOrError already sent the error response
    return;
  }

  const upstreamBase = resolveUpstreamBaseUrl();
  const upstreamUrl = `${upstreamBase}${pathname}`;
  const apiKey = resolveUpstreamApiKey(callerToken);
  const headers = buildUpstreamHeaders(pathname, apiKey, "application/json");

  const requestBody = JSON.stringify(body);
  const isStream =
    typeof body === "object" && body !== null && (body as Record<string, unknown>).stream === true;

  let upstreamRes: Response;
  try {
    upstreamRes = await fetch(upstreamUrl, {
      method: "POST",
      headers,
      body: requestBody,
    });
  } catch (err) {
    log.error(`upstream request failed: ${String(err)}`);
    sendJson(res, 502, {
      error: { message: "upstream provider unavailable", type: "upstream_error" },
    });
    return;
  }

  // Forward status and content-type from upstream
  res.statusCode = upstreamRes.status;

  const upstreamContentType = upstreamRes.headers.get("content-type");
  if (upstreamContentType) {
    res.setHeader("Content-Type", upstreamContentType);
  }

  if (!upstreamRes.body) {
    // Non-streaming: read full body and forward
    const text = await upstreamRes.text();
    res.end(text);
    return;
  }

  if (isStream && upstreamRes.ok) {
    // Stream SSE response
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();
  }

  // Pipe the response body through
  const reader = upstreamRes.body.getReader();
  const decoder = new TextDecoder();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      const chunk = decoder.decode(value, { stream: true });
      res.write(chunk);
    }
  } catch (err) {
    log.error(`upstream stream error: ${String(err)}`);
  } finally {
    res.end();
  }
}

/**
 * Proxy a GET request to the upstream LLM provider.
 */
async function proxyGetRequest(
  res: ServerResponse,
  pathname: string,
  callerToken: string | undefined,
): Promise<void> {
  const upstreamBase = resolveUpstreamBaseUrl();
  const upstreamUrl = `${upstreamBase}${pathname}`;
  const apiKey = resolveUpstreamApiKey(callerToken);
  const headers = buildUpstreamHeaders(pathname, apiKey);

  let upstreamRes: Response;
  try {
    upstreamRes = await fetch(upstreamUrl, {
      method: "GET",
      headers,
    });
  } catch (err) {
    log.error(`upstream request failed: ${String(err)}`);
    sendJson(res, 502, {
      error: { message: "upstream provider unavailable", type: "upstream_error" },
    });
    return;
  }

  res.statusCode = upstreamRes.status;
  const upstreamContentType = upstreamRes.headers.get("content-type");
  if (upstreamContentType) {
    res.setHeader("Content-Type", upstreamContentType);
  }

  const text = await upstreamRes.text();
  res.end(text);
}

/**
 * Handle LLM proxy HTTP requests.
 * Returns true if the request was handled, false if it should fall through.
 */
export async function handleLlmProxyHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  opts: LlmProxyHttpOptions,
): Promise<boolean> {
  const url = new URL(req.url ?? "/", `http://${req.headers.host || "localhost"}`);
  const pathname = url.pathname;

  if (!isProxyPath(pathname)) {
    return false;
  }

  const method = (req.method ?? "GET").toUpperCase();

  // GET /v1/models
  if (PROXY_GET_PATHS.has(pathname)) {
    if (method !== "GET" && method !== "HEAD") {
      sendMethodNotAllowed(res, "GET, HEAD");
      return true;
    }

    const authorized = await authorizeRequest(req, res, opts);
    if (!authorized) {
      return true;
    }

    const callerToken = getBearerToken(req);
    await proxyGetRequest(res, pathname, callerToken);
    return true;
  }

  // POST /v1/completions, /v1/embeddings, /v1/messages
  if (PROXY_POST_PATHS.has(pathname)) {
    if (method !== "POST") {
      sendMethodNotAllowed(res);
      return true;
    }

    const authorized = await authorizeRequest(req, res, opts);
    if (!authorized) {
      return true;
    }

    const callerToken = getBearerToken(req);
    await proxyPostRequest(req, res, pathname, callerToken);
    return true;
  }

  return false;
}
