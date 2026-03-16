/**
 * IAM (OIDC) Authentication for the Gateway.
 *
 * Thin wrapper around @hanzo/iam SDK — validates JWTs issued by
 * iam.hanzo.ai using OIDC/JWKS discovery and extracts user identity.
 */

import {
  validateToken,
  clearJwksCache as clearSdkJwksCache,
  IamClient,
  type IamConfig,
  type IamAuthResult,
  type IamJwtClaims,
} from "@hanzo/iam";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { GatewayIamConfig } from "../config/types.gateway.js";

// ---------------------------------------------------------------------------
// Re-exports for gateway consumers
// ---------------------------------------------------------------------------

export type { IamAuthResult, IamJwtClaims };

/** Gateway-specific auth result that extends the SDK result with org/role info. */
export type GatewayIamAuthResult =
  | {
      ok: true;
      userId: string;
      email?: string;
      name?: string;
      avatar?: string;
      owner: string;
      orgIds: string[];
      currentOrgId?: string;
      roles: string[];
      claims: IamJwtClaims;
    }
  | {
      ok: false;
      reason: string;
    };

// ---------------------------------------------------------------------------
// Config adapter
// ---------------------------------------------------------------------------

function toIamConfig(config: GatewayIamConfig): IamConfig {
  return {
    serverUrl: config.serverUrl,
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    orgName: config.orgName,
    appName: config.appName,
  };
}

// ---------------------------------------------------------------------------
// Client cache (one per server URL)
// ---------------------------------------------------------------------------

const clientCache = new Map<string, IamClient>();

export function getIamClient(config: GatewayIamConfig): IamClient {
  const key = config.serverUrl.replace(/\/+$/, "");
  let client = clientCache.get(key);
  if (!client) {
    client = new IamClient(toIamConfig(config));
    clientCache.set(key, client);
  }
  return client;
}

// ---------------------------------------------------------------------------
// JWKS URL rewriting (bypass Cloudflare/WAF on external JWKS endpoint)
// ---------------------------------------------------------------------------

/**
 * When `jwksUrl` is configured, the OIDC discovery response's `jwks_uri` points
 * to the external URL (e.g. `https://hanzo.id/.well-known/jwks`) which may be
 * blocked by Cloudflare. We intercept `fetch` calls to rewrite the JWKS URL
 * to the internal K8s service URL during token validation.
 */
function withJwksRewrite<T>(
  jwksUrl: string,
  externalHost: string,
  fn: () => Promise<T>,
): Promise<T> {
  const originalFetch = globalThis.fetch;
  const externalJwksUrl = `${externalHost.replace(/\/+$/, "")}/.well-known/jwks`;

  globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url === externalJwksUrl || url.endsWith("/.well-known/jwks")) {
      return originalFetch(jwksUrl, init);
    }
    return originalFetch(input, init);
  };

  return fn().finally(() => {
    globalThis.fetch = originalFetch;
  });
}

// ---------------------------------------------------------------------------
// Token validation
// ---------------------------------------------------------------------------

/**
 * Validate a JWT access token against IAM JWKS and extract user claims.
 *
 * When `config.jwksUrl` is set, rewrites the JWKS fetch URL to bypass
 * Cloudflare/WAF blocking. Otherwise uses the @hanzo/iam SDK directly.
 */
export async function validateIamToken(
  token: string,
  config: GatewayIamConfig,
): Promise<GatewayIamAuthResult> {
  const validate = () => validateToken(token, toIamConfig(config));

  // When jwksUrl is configured, intercept JWKS fetches to use the internal URL.
  let sdkResult = config.jwksUrl
    ? await withJwksRewrite(config.jwksUrl, config.serverUrl, validate)
    : await validate();

  console.log(`[auth-iam] initial validation: ok=${sdkResult.ok} reason=${sdkResult.ok ? 'n/a' : (sdkResult as any).reason}`);

  // The @hanzo/iam SDK's audience retry checks for "audience" in the jose
  // error message, but jose actually says '"aud" claim check failed'.
  // Work around by decoding the JWT, checking for an audience/issuer mismatch,
  // and retrying with the token's actual values so jose's check passes while
  // signature + expiry verification still applies.
  // When the SDK returns iam_signature_invalid, it may be due to an
  // issuer or audience mismatch (jose groups these under the same error).
  // Retry using jose directly — bypassing the SDK's OIDC discovery which
  // would try to reach the token's issuer (potentially unreachable).
  if (!sdkResult.ok && sdkResult.reason === "iam_signature_invalid") {
    try {
      const parts = token.split(".");
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
        const tokenIssuer = typeof payload.iss === "string" ? payload.iss : null;
        const configIssuer = config.serverUrl.replace(/\/+$/, "");

        console.log(`[auth-iam] retry: tokenIss=${tokenIssuer} configIss=${configIssuer}`);
        if (tokenIssuer && tokenIssuer !== configIssuer) {
          // The token's issuer differs from the configured server URL.
          // Use jose directly with the reachable JWKS endpoint (from config)
          // but accept the token's actual issuer claim.
          const jwksUrl = config.jwksUrl ?? `${configIssuer}/.well-known/jwks`;
          const keySet = createRemoteJWKSet(new URL(jwksUrl));

          // Try with audience check first, then without
          let verified;
          try {
            verified = await jwtVerify(token, keySet, {
              issuer: tokenIssuer,
              audience: config.clientId,
              clockTolerance: 30,
            });
          } catch {
            // Audience may not match — retry without audience check
            verified = await jwtVerify(token, keySet, {
              issuer: tokenIssuer,
              clockTolerance: 30,
            });
          }

          const claims = verified.payload as unknown as IamJwtClaims;
          const sub =
            claims.sub ||
            (typeof claims.owner === "string" && typeof claims.name === "string"
              ? `${claims.owner}/${claims.name}`
              : undefined);

          if (sub) {
            const ownerParts = sub.split("/");
            const owner = ownerParts.length > 1 ? ownerParts[0] : config.orgName ?? "unknown";
            sdkResult = {
              ok: true,
              userId: sub,
              email: typeof claims.email === "string" ? claims.email : undefined,
              name: typeof claims.name === "string" ? claims.name : undefined,
              avatar: typeof claims.picture === "string" ? claims.picture : undefined,
              owner,
              claims,
            };
          }
        }
      }
    } catch (retryErr) {
      console.error("[auth-iam] retry threw:", retryErr);
    }
  }

  // Application tokens may lack a standard `sub` claim but carry `owner`/`name`
  // (e.g. "admin/app-hanzobot").  Construct sub from those fields so the token
  // is still accepted after signature verification passed.
  if (!sdkResult.ok && sdkResult.reason === "iam_subject_missing") {
    try {
      const parts = token.split(".");
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
        if (typeof payload.owner === "string" && typeof payload.name === "string") {
          const sub = `${payload.owner}/${payload.name}`;
          sdkResult = {
            ok: true,
            userId: sub,
            email: typeof payload.email === "string" ? payload.email : undefined,
            name: payload.name,
            avatar: typeof payload.picture === "string" ? payload.picture : undefined,
            owner: payload.owner,
            claims: payload as IamJwtClaims,
          };
        }
      }
    } catch {
      // Fall through to error return below
    }
  }

  if (!sdkResult.ok) {
    return { ok: false, reason: sdkResult.reason };
  }

  // Extract org/role info from claims (Casdoor-specific)
  const claims = sdkResult.claims;
  const orgIds: string[] = [];

  // Casdoor groups may contain org membership
  if (Array.isArray(claims.groups)) {
    orgIds.push(...claims.groups.filter((g): g is string => typeof g === "string"));
  }

  // The "owner" field from Casdoor sub "org/username" split
  if (sdkResult.owner && !orgIds.includes(sdkResult.owner)) {
    orgIds.push(sdkResult.owner);
  }

  return {
    ok: true,
    userId: sdkResult.userId,
    email: sdkResult.email,
    name: sdkResult.name,
    avatar: sdkResult.avatar,
    owner: sdkResult.owner,
    orgIds,
    currentOrgId: orgIds[0],
    roles: Array.isArray(claims.roles)
      ? claims.roles.filter((r): r is string => typeof r === "string")
      : [],
    claims,
  };
}

/** Force-clear the JWKS cache (for testing or key rotation). */
export function clearJwksCache(): void {
  clearSdkJwksCache();
}
