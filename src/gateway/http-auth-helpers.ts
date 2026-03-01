import type { IncomingMessage, ServerResponse } from "node:http";
import type { AuthRateLimiter } from "./auth-rate-limit.js";
import {
  authorizeGatewayConnect,
  type GatewayAuthResult,
  type ResolvedGatewayAuth,
} from "./auth.js";
import { sendGatewayAuthFailure } from "./http-common.js";
import { getBearerToken } from "./http-utils.js";

export async function authorizeGatewayBearerRequestOrReply(params: {
  req: IncomingMessage;
  res: ServerResponse;
  auth: ResolvedGatewayAuth;
  trustedProxies?: string[];
  rateLimiter?: AuthRateLimiter;
}): Promise<boolean> {
  const result = await authorizeGatewayBearerRequest(params);
  return result !== null;
}

/**
 * Like `authorizeGatewayBearerRequestOrReply`, but returns the full
 * auth result on success (needed for IAM billing/tenant context).
 * Returns `null` if auth fails (response already sent).
 */
export async function authorizeGatewayBearerRequest(params: {
  req: IncomingMessage;
  res: ServerResponse;
  auth: ResolvedGatewayAuth;
  trustedProxies?: string[];
  rateLimiter?: AuthRateLimiter;
}): Promise<GatewayAuthResult | null> {
  const token = getBearerToken(params.req);
  const authResult = await authorizeGatewayConnect({
    auth: params.auth,
    connectAuth: token ? { token, password: token } : null,
    req: params.req,
    trustedProxies: params.trustedProxies,
    rateLimiter: params.rateLimiter,
  });
  if (!authResult.ok) {
    sendGatewayAuthFailure(params.res, authResult);
    return null;
  }
  // Attach the raw bearer token so downstream handlers can forward it
  // to billing APIs and cloud AI endpoints for per-user authorization.
  if (token && !authResult.rawToken) {
    authResult.rawToken = token;
  }
  return authResult;
}
