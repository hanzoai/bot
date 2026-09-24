/**
 * IAM (OIDC) Authentication for the Gateway.
 *
 * validateIamToken verifies a hanzo.id JWT and says who it is and which orgs it
 * may act in. The OAuth flows (iam-oauth-http.ts) use the @hanzo/iam client.
 */

// The SDK names its server-side types Config/AuthResult/JwtClaims; they are aliased
// to the Iam* names this wrapper exposes. Config is the one IamClient accepts — not
// the similarly named IAMConfig, which configures the SDK's browser entrypoint.
import {
  IamClient,
  type Config as IamConfig,
  type AuthResult as IamAuthResult,
  type JwtClaims as IamJwtClaims,
} from "@hanzo/iam";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { GatewayIamConfig } from "../config/types.gateway.js";

/** Canonical HIP-0111 JWKS path — what IAM's discovery document advertises. */
const IAM_JWKS_PATH = "/v1/iam/.well-known/jwks";

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
      /**
       * The org the token acts in by default: a person's home org (the first of
       * the signed `orgs` membership), or an application token's own org. Absent
       * when the token names neither — it then acts in no org.
       */
      owner?: string;
      /** Every org the token may act in — the signed membership, home first. */
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
// Token validation
// ---------------------------------------------------------------------------

/** One remote key set per JWKS URL, so keys are fetched once and rotated by jose. */
const keySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function keySetFor(url: string) {
  let set = keySets.get(url);
  if (!set) {
    set = createRemoteJWKSet(new URL(url));
    keySets.set(url, set);
  }
  return set;
}

/** IAM's identity class for a client_credentials token (hanzoai/iam schema.Program). */
const APPLICATION = "application";

/**
 * Validate a hanzo.id JWT: its signature against IAM's JWKS (config.jwksUrl, the
 * in-cluster address, or the issuer's own), its issuer against config.serverUrl
 * — pinned, one brand per gateway — and its expiry.
 *
 * The audience is not a gate, as in cloud (TestValidate_AudienceIsNotAGate): IAM
 * stamps `aud` with the app that minted the token, and a request cloud relays as
 * its caller carries the console's token, not this gateway's.
 *
 * WHICH ORG. IAM's `owner` claim is the org of the APPLICATION a person signed in
 * through, not the person's; the person's tenancy is the signed `orgs` membership,
 * home org first (hanzoai/iam internal/oidc/jwt.go). So a person acts in
 * orgs[0], or any org of `orgs` it names; an application token (type
 * "application", no membership) acts in its own org, `owner`; a token that states
 * neither acts in no org. Nothing is inferred from `sub` and nothing falls back to
 * config.orgName.
 */
export async function validateIamToken(
  token: string,
  config: GatewayIamConfig,
): Promise<GatewayIamAuthResult> {
  if (!token) {
    return { ok: false, reason: "iam_token_missing" };
  }
  const issuer = config.serverUrl.replace(/\/+$/, "");
  let claims: IamJwtClaims & Record<string, unknown>;
  try {
    const verified = await jwtVerify(
      token,
      keySetFor(config.jwksUrl ?? `${issuer}${IAM_JWKS_PATH}`),
      {
        issuer,
        clockTolerance: 30,
      },
    );
    claims = verified.payload as IamJwtClaims & Record<string, unknown>;
  } catch (err) {
    const code = (err as { code?: string }).code;
    return {
      ok: false,
      reason: code === "ERR_JWT_EXPIRED" ? "iam_token_expired" : "iam_signature_invalid",
    };
  }

  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  const application = claims.type === APPLICATION;
  const appOrg = application ? str(claims.owner) : undefined;
  const appName = application ? str(claims.name) : undefined;
  const sub = str(claims.sub) ?? (appOrg && appName ? `${appOrg}/${appName}` : undefined);
  if (!sub) {
    return { ok: false, reason: "iam_subject_missing" };
  }
  const orgIds: string[] = [];
  if (Array.isArray(claims.orgs)) {
    for (const ref of claims.orgs as unknown[]) {
      const org = str((ref as { org?: unknown } | null)?.org);
      if (org && !orgIds.includes(org)) {
        orgIds.push(org);
      }
    }
  }
  if (orgIds.length === 0 && appOrg) {
    orgIds.push(appOrg);
  }
  return {
    ok: true,
    userId: sub,
    email: str(claims.email),
    name: str(claims.name),
    avatar: str(claims.picture),
    owner: orgIds[0],
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
  keySets.clear();
}
