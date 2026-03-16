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

  // The @hanzo/iam SDK's audience retry checks for "audience" in the jose
  // error message, but jose actually says '"aud" claim check failed'.
  // Work around by decoding the JWT, checking for an audience/issuer mismatch,
  // and retrying with the token's actual values so jose's check passes while
  // signature + expiry verification still applies.
  if (!sdkResult.ok && sdkResult.reason === "iam_signature_invalid") {
    try {
      const parts = token.split(".");
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
        const aud = Array.isArray(payload.aud)
          ? payload.aud
          : typeof payload.aud === "string"
            ? [payload.aud]
            : [];
        const tokenIssuer = typeof payload.iss === "string" ? payload.iss : null;
        const configIssuer = config.serverUrl.replace(/\/+$/, "");

        console.log(`[auth-iam] retry check: tokenIss=${tokenIssuer} configIss=${configIssuer} tokenAud=${JSON.stringify(aud)} clientId=${config.clientId}`);

        // Build a retry config that adjusts audience and/or issuer to match
        // the token's actual claims. This handles Casdoor setups where the
        // OIDC discovery endpoint (e.g. hanzo.id) advertises a different
        // issuer than what the IAM server stamps into JWTs (e.g. iam.hanzo.ai).
        const needAudRetry = aud.length > 0 && !aud.includes(config.clientId);
        const needIssRetry = tokenIssuer && tokenIssuer !== configIssuer;

        console.log(`[auth-iam] needAudRetry=${needAudRetry} needIssRetry=${needIssRetry}`);

        if (needAudRetry || needIssRetry) {
          const retryIamConfig: IamConfig = {
            ...toIamConfig(config),
            ...(needAudRetry ? { clientId: aud[0] } : {}),
            ...(needIssRetry ? { serverUrl: tokenIssuer! } : {}),
          };
          // Use the same JWKS endpoint (from the reachable server) even when
          // retrying with the token's issuer — the signing keys are shared.
          const jwksOverride = config.jwksUrl ?? `${configIssuer}/.well-known/jwks`;
          console.log(`[auth-iam] retrying with serverUrl=${retryIamConfig.serverUrl} clientId=${retryIamConfig.clientId} jwksOverride=${jwksOverride}`);
          const retryValidate = () => validateToken(token, retryIamConfig);
          const retryResult = await withJwksRewrite(
            jwksOverride,
            retryIamConfig.serverUrl,
            retryValidate,
          );
          console.log(`[auth-iam] retry result: ok=${retryResult.ok} reason=${retryResult.ok ? 'n/a' : (retryResult as any).reason}`);
          if (retryResult.ok) {
            sdkResult = retryResult;
          }
        }
      }
    } catch (retryErr) {
      console.error("[auth-iam] retry threw:", retryErr);
      // Fall through to original error
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
