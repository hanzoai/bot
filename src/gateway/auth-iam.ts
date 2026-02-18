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
// Token validation
// ---------------------------------------------------------------------------

/**
 * Validate a JWT access token against IAM JWKS and extract user claims.
 *
 * Uses the @hanzo/iam SDK which performs OIDC discovery, JWKS key fetch,
 * and jose-based JWT verification (signature, issuer, audience, expiry).
 */
export async function validateIamToken(
  token: string,
  config: GatewayIamConfig,
): Promise<GatewayIamAuthResult> {
  const sdkResult = await validateToken(token, toIamConfig(config));

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
