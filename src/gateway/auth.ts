import type { IncomingMessage } from "node:http";
import type {
  GatewayAuthConfig,
  GatewayIamConfig,
  GatewayTailscaleMode,
  GatewayTrustedProxyConfig,
} from "../config/config.js";
import { resolveSecretInputRef } from "../config/types.secrets.js";
import { readTailscaleWhoisIdentity, type TailscaleWhoisIdentity } from "../infra/tailscale.js";
import { safeEqualSecret } from "../security/secret-equal.js";
import {
  AUTH_RATE_LIMIT_SCOPE_SHARED_SECRET,
  type AuthRateLimiter,
  type RateLimitCheckResult,
} from "./auth-rate-limit.js";
import { resolveGatewayCredentialsFromValues } from "./credentials.js";
import {
  isLocalishHost,
  isLoopbackAddress,
  isTrustedProxyAddress,
  resolveClientIp,
} from "./net.js";

export type ResolvedGatewayAuthMode = "none" | "token" | "trusted-proxy" | "iam";
export type ResolvedGatewayAuthModeSource = "override" | "config" | "token" | "default";

export type ResolvedGatewayAuth = {
  mode: ResolvedGatewayAuthMode;
  modeSource?: ResolvedGatewayAuthModeSource;
  token?: string;
  allowTailscale: boolean;
  trustedProxy?: GatewayTrustedProxyConfig;
  iam?: GatewayIamConfig;
};

export type GatewayAuthResult = {
  ok: boolean;
  method?: "none" | "token" | "tailscale" | "device-token" | "trusted-proxy" | "iam";
  user?: string;
  reason?: string;
  /** Present when the request was blocked by the rate limiter. */
  rateLimited?: boolean;
  /** Milliseconds the client should wait before retrying (when rate-limited). */
  retryAfterMs?: number;
  /**
   * Viewer's org, resolved from the IAM JWT (owner/currentOrgId). Present only
   * for `method: "iam"`. Used to scope the per-viewer cloud read-through so this
   * shared gateway never serves one org's cloud agents to another.
   */
  orgId?: string;
  /**
   * The raw bearer JWT the viewer presented at handshake. Present only for
   * `method: "iam"`. cloud resolves the org server-side from its `owner` claim;
   * we never present a pod-fixed credential.
   */
  bearer?: string;
};

type ConnectAuth = {
  token?: string;
};

export type GatewayAuthSurface = "http" | "ws-control-ui";

export type AuthorizeGatewayConnectParams = {
  auth: ResolvedGatewayAuth;
  connectAuth?: ConnectAuth | null;
  req?: IncomingMessage;
  trustedProxies?: string[];
  tailscaleWhois?: TailscaleWhoisLookup;
  /**
   * Explicit auth surface. HTTP keeps Tailscale forwarded-header auth disabled.
   * WS Control UI enables it intentionally for tokenless trusted-host login.
   */
  authSurface?: GatewayAuthSurface;
  /** Optional rate limiter instance; when provided, failed attempts are tracked per IP. */
  rateLimiter?: AuthRateLimiter;
  /** Client IP used for rate-limit tracking. Falls back to proxy-aware request IP resolution. */
  clientIp?: string;
  /** Optional limiter scope; defaults to shared-secret auth scope. */
  rateLimitScope?: string;
  /** Trust X-Real-IP only when explicitly enabled. */
  allowRealIpFallback?: boolean;
};

type TailscaleUser = {
  login: string;
  name: string;
  profilePic?: string;
};

type TailscaleWhoisLookup = (ip: string) => Promise<TailscaleWhoisIdentity | null>;

function normalizeLogin(login: string): string {
  return login.trim().toLowerCase();
}

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

const TAILSCALE_TRUSTED_PROXIES = ["127.0.0.1", "::1"] as const;

function resolveTailscaleClientIp(req?: IncomingMessage): string | undefined {
  if (!req) {
    return undefined;
  }
  return resolveClientIp({
    remoteAddr: req.socket?.remoteAddress ?? "",
    forwardedFor: headerValue(req.headers?.["x-forwarded-for"]),
    trustedProxies: [...TAILSCALE_TRUSTED_PROXIES],
  });
}

function resolveRequestClientIp(
  req?: IncomingMessage,
  trustedProxies?: string[],
  allowRealIpFallback = false,
): string | undefined {
  if (!req) {
    return undefined;
  }
  return resolveClientIp({
    remoteAddr: req.socket?.remoteAddress ?? "",
    forwardedFor: headerValue(req.headers?.["x-forwarded-for"]),
    realIp: headerValue(req.headers?.["x-real-ip"]),
    trustedProxies,
    allowRealIpFallback,
  });
}

export function isLocalDirectRequest(
  req?: IncomingMessage,
  trustedProxies?: string[],
  allowRealIpFallback = false,
): boolean {
  if (!req) {
    return false;
  }
  const clientIp = resolveRequestClientIp(req, trustedProxies, allowRealIpFallback) ?? "";
  if (!isLoopbackAddress(clientIp)) {
    return false;
  }

  const hasForwarded = Boolean(
    req.headers?.["x-forwarded-for"] ||
    req.headers?.["x-real-ip"] ||
    req.headers?.["x-forwarded-host"],
  );

  const remoteIsTrustedProxy = isTrustedProxyAddress(req.socket?.remoteAddress, trustedProxies);
  return isLocalishHost(req.headers?.host) && (!hasForwarded || remoteIsTrustedProxy);
}

function getTailscaleUser(req?: IncomingMessage): TailscaleUser | null {
  if (!req) {
    return null;
  }
  const login = req.headers["tailscale-user-login"];
  if (typeof login !== "string" || !login.trim()) {
    return null;
  }
  const nameRaw = req.headers["tailscale-user-name"];
  const profilePic = req.headers["tailscale-user-profile-pic"];
  const name = typeof nameRaw === "string" && nameRaw.trim() ? nameRaw.trim() : login.trim();
  return {
    login: login.trim(),
    name,
    profilePic: typeof profilePic === "string" && profilePic.trim() ? profilePic.trim() : undefined,
  };
}

function hasTailscaleProxyHeaders(req?: IncomingMessage): boolean {
  if (!req) {
    return false;
  }
  return Boolean(
    req.headers["x-forwarded-for"] &&
    req.headers["x-forwarded-proto"] &&
    req.headers["x-forwarded-host"],
  );
}

function isTailscaleProxyRequest(req?: IncomingMessage): boolean {
  if (!req) {
    return false;
  }
  return isLoopbackAddress(req.socket?.remoteAddress) && hasTailscaleProxyHeaders(req);
}

async function resolveVerifiedTailscaleUser(params: {
  req?: IncomingMessage;
  tailscaleWhois: TailscaleWhoisLookup;
}): Promise<{ ok: true; user: TailscaleUser } | { ok: false; reason: string }> {
  const { req, tailscaleWhois } = params;
  const tailscaleUser = getTailscaleUser(req);
  if (!tailscaleUser) {
    return { ok: false, reason: "tailscale_user_missing" };
  }
  if (!isTailscaleProxyRequest(req)) {
    return { ok: false, reason: "tailscale_proxy_missing" };
  }
  const clientIp = resolveTailscaleClientIp(req);
  if (!clientIp) {
    return { ok: false, reason: "tailscale_whois_failed" };
  }
  const whois = await tailscaleWhois(clientIp);
  if (!whois?.login) {
    return { ok: false, reason: "tailscale_whois_failed" };
  }
  if (normalizeLogin(whois.login) !== normalizeLogin(tailscaleUser.login)) {
    return { ok: false, reason: "tailscale_user_mismatch" };
  }
  return {
    ok: true,
    user: {
      login: whois.login,
      name: whois.name ?? tailscaleUser.name,
      profilePic: tailscaleUser.profilePic,
    },
  };
}

export function resolveGatewayAuth(params: {
  authConfig?: GatewayAuthConfig | null;
  authOverride?: GatewayAuthConfig | null;
  env?: NodeJS.ProcessEnv;
  tailscaleMode?: GatewayTailscaleMode;
}): ResolvedGatewayAuth {
  const baseAuthConfig = params.authConfig ?? {};
  const authOverride = params.authOverride ?? undefined;
  const authConfig: GatewayAuthConfig = { ...baseAuthConfig };
  if (authOverride) {
    if (authOverride.mode !== undefined) {
      authConfig.mode = authOverride.mode;
    }
    if (authOverride.token !== undefined) {
      authConfig.token = authOverride.token;
    }
    if (authOverride.allowTailscale !== undefined) {
      authConfig.allowTailscale = authOverride.allowTailscale;
    }
    if (authOverride.rateLimit !== undefined) {
      authConfig.rateLimit = authOverride.rateLimit;
    }
    if (authOverride.trustedProxy !== undefined) {
      authConfig.trustedProxy = authOverride.trustedProxy;
    }
    if (authOverride.iam !== undefined) {
      authConfig.iam = authOverride.iam;
    }
  }
  const env = params.env ?? process.env;
  const tokenRef = resolveSecretInputRef({ value: authConfig.token }).ref;
  const resolvedCredentials = resolveGatewayCredentialsFromValues({
    configToken: tokenRef ? undefined : authConfig.token,
    env,
    includeLegacyEnv: false,
    tokenPrecedence: "config-first",
  });
  const token = resolvedCredentials.token;
  const trustedProxy = authConfig.trustedProxy;
  const iam = authConfig.iam;

  let mode: ResolvedGatewayAuth["mode"];
  let modeSource: ResolvedGatewayAuth["modeSource"];
  if (authOverride?.mode !== undefined) {
    mode = authOverride.mode;
    modeSource = "override";
  } else if (authConfig.mode) {
    mode = authConfig.mode;
    modeSource = "config";
  } else if (token) {
    mode = "token";
    modeSource = "token";
  } else {
    mode = "token";
    modeSource = "default";
  }

  const allowTailscale =
    authConfig.allowTailscale ?? (params.tailscaleMode === "serve" && mode !== "trusted-proxy");

  return {
    mode,
    modeSource,
    token,
    allowTailscale,
    trustedProxy,
    iam,
  };
}

export function assertGatewayAuthConfigured(auth: ResolvedGatewayAuth): void {
  if (auth.mode === "token" && !auth.token) {
    if (auth.allowTailscale) {
      return;
    }
    throw new Error(
      "gateway auth mode is token, but no token was configured (set gateway.auth.token or BOT_GATEWAY_TOKEN)",
    );
  }
  if (auth.mode === "trusted-proxy") {
    if (!auth.trustedProxy) {
      throw new Error(
        "gateway auth mode is trusted-proxy, but no trustedProxy config was provided (set gateway.auth.trustedProxy)",
      );
    }
    if (!auth.trustedProxy.userHeader || auth.trustedProxy.userHeader.trim() === "") {
      throw new Error(
        "gateway auth mode is trusted-proxy, but trustedProxy.userHeader is empty (set gateway.auth.trustedProxy.userHeader)",
      );
    }
  }
  if (auth.mode === "iam") {
    if (!auth.iam) {
      throw new Error(
        "gateway auth mode is iam, but no iam config was provided (set gateway.auth.iam)",
      );
    }
    if (!auth.iam.serverUrl || auth.iam.serverUrl.trim() === "") {
      throw new Error(
        "gateway auth mode is iam, but iam.serverUrl is empty (set gateway.auth.iam.serverUrl)",
      );
    }
    if (!auth.iam.clientId || auth.iam.clientId.trim() === "") {
      throw new Error(
        "gateway auth mode is iam, but iam.clientId is empty (set gateway.auth.iam.clientId)",
      );
    }
  }
}

/**
 * Check if the request came from a trusted proxy and extract user identity.
 * Returns the user identity if valid, or null with a reason if not.
 */
function authorizeTrustedProxy(params: {
  req?: IncomingMessage;
  trustedProxies?: string[];
  trustedProxyConfig: GatewayTrustedProxyConfig;
}): { user: string } | { reason: string } {
  const { req, trustedProxies, trustedProxyConfig } = params;

  if (!req) {
    return { reason: "trusted_proxy_no_request" };
  }

  const remoteAddr = req.socket?.remoteAddress;
  if (!remoteAddr || !isTrustedProxyAddress(remoteAddr, trustedProxies)) {
    return { reason: "trusted_proxy_untrusted_source" };
  }

  const requiredHeaders = trustedProxyConfig.requiredHeaders ?? [];
  for (const header of requiredHeaders) {
    const value = headerValue(req.headers[header.toLowerCase()]);
    if (!value || value.trim() === "") {
      return { reason: `trusted_proxy_missing_header_${header}` };
    }
  }

  const userHeaderValue = headerValue(req.headers[trustedProxyConfig.userHeader.toLowerCase()]);
  if (!userHeaderValue || userHeaderValue.trim() === "") {
    return { reason: "trusted_proxy_user_missing" };
  }

  const user = userHeaderValue.trim();

  const allowUsers = trustedProxyConfig.allowUsers ?? [];
  if (allowUsers.length > 0 && !allowUsers.includes(user)) {
    return { reason: "trusted_proxy_user_not_allowed" };
  }

  return { user };
}

function shouldAllowTailscaleHeaderAuth(authSurface: GatewayAuthSurface): boolean {
  return authSurface === "ws-control-ui";
}

export async function authorizeGatewayConnect(
  params: AuthorizeGatewayConnectParams,
): Promise<GatewayAuthResult> {
  const { auth, connectAuth, req, trustedProxies } = params;
  const tailscaleWhois = params.tailscaleWhois ?? readTailscaleWhoisIdentity;
  const authSurface = params.authSurface ?? "http";
  const allowTailscaleHeaderAuth = shouldAllowTailscaleHeaderAuth(authSurface);
  const localDirect = isLocalDirectRequest(
    req,
    trustedProxies,
    params.allowRealIpFallback === true,
  );

  if (auth.mode === "trusted-proxy") {
    if (!auth.trustedProxy) {
      return { ok: false, reason: "trusted_proxy_config_missing" };
    }
    if (!trustedProxies || trustedProxies.length === 0) {
      return { ok: false, reason: "trusted_proxy_no_proxies_configured" };
    }

    const result = authorizeTrustedProxy({
      req,
      trustedProxies,
      trustedProxyConfig: auth.trustedProxy,
    });

    if ("user" in result) {
      return { ok: true, method: "trusted-proxy", user: result.user };
    }
    return { ok: false, reason: result.reason };
  }

  if (auth.mode === "none") {
    return { ok: true, method: "none" };
  }

  const limiter = params.rateLimiter;
  const ip =
    params.clientIp ??
    resolveRequestClientIp(req, trustedProxies, params.allowRealIpFallback === true) ??
    req?.socket?.remoteAddress;
  const rateLimitScope = params.rateLimitScope ?? AUTH_RATE_LIMIT_SCOPE_SHARED_SECRET;
  if (limiter) {
    const rlCheck: RateLimitCheckResult = limiter.check(ip, rateLimitScope);
    if (!rlCheck.allowed) {
      return {
        ok: false,
        reason: "rate_limited",
        rateLimited: true,
        retryAfterMs: rlCheck.retryAfterMs,
      };
    }
  }

  if (allowTailscaleHeaderAuth && auth.allowTailscale && !localDirect) {
    const tailscaleCheck = await resolveVerifiedTailscaleUser({
      req,
      tailscaleWhois,
    });
    if (tailscaleCheck.ok) {
      limiter?.reset(ip, rateLimitScope);
      return {
        ok: true,
        method: "tailscale",
        user: tailscaleCheck.user.login,
      };
    }
  }

  // IAM (OIDC JWT) authentication — validate the provided token as a JWT
  // issued by the configured IAM provider (e.g. hanzo.id / Casdoor).
  // Falls back to shared gateway-token comparison so cloud-provisioned pods
  // that authenticate with BOT_GATEWAY_TOKEN still work alongside IAM users.
  if (auth.mode === "iam") {
    if (!connectAuth?.token) {
      limiter?.recordFailure(ip, rateLimitScope);
      return { ok: false, reason: "iam_token_missing" };
    }
    // First, try IAM JWT validation if IAM config is present.
    // Use a variable for the module path so TypeScript does not resolve the
    // import statically — @hanzo/iam types are unavailable in the plugin-sdk
    // DTS build and would cause compilation errors.
    if (auth.iam) {
      try {
        const iamMod = "./auth-iam.js";
        const { validateIamToken } = (await import(iamMod)) as {
          validateIamToken: (
            token: string,
            config: GatewayIamConfig,
          ) => Promise<
            | { ok: true; userId: string; currentOrgId?: string; owner?: string }
            | { ok: false; reason: string }
          >;
        };
        const iamResult = await validateIamToken(connectAuth.token, auth.iam);
        if (iamResult.ok) {
          limiter?.reset(ip, rateLimitScope);
          // Retain the viewer's org + raw bearer so the per-viewer cloud
          // read-through can scope to THIS org only. `owner` is exactly cloud's
          // server-side scoping key; fall back to it when currentOrgId is absent.
          const orgId = iamResult.currentOrgId ?? iamResult.owner;
          return orgId
            ? { ok: true, method: "iam", user: iamResult.userId, orgId, bearer: connectAuth.token }
            : { ok: true, method: "iam", user: iamResult.userId };
        }
      } catch {
        // IAM validation threw (network error, JWKS unreachable, etc.)
        // — fall through to shared-token check below.
      }
    }
    // Fallback: accept a matching shared gateway token so cloud-provisioned
    // nodes (which carry BOT_GATEWAY_TOKEN, not an IAM JWT) can connect.
    if (auth.token && safeEqualSecret(connectAuth.token, auth.token)) {
      limiter?.reset(ip, rateLimitScope);
      return { ok: true, method: "token" };
    }
    limiter?.recordFailure(ip, rateLimitScope);
    return { ok: false, reason: "iam_validation_failed" };
  }

  if (auth.mode === "token") {
    if (!auth.token) {
      return { ok: false, reason: "token_missing_config" };
    }
    if (!connectAuth?.token) {
      limiter?.recordFailure(ip, rateLimitScope);
      return { ok: false, reason: "token_missing" };
    }
    if (!safeEqualSecret(connectAuth.token, auth.token)) {
      limiter?.recordFailure(ip, rateLimitScope);
      return { ok: false, reason: "token_mismatch" };
    }
    limiter?.reset(ip, rateLimitScope);
    return { ok: true, method: "token" };
  }

  limiter?.recordFailure(ip, rateLimitScope);
  return { ok: false, reason: "unauthorized" };
}

export async function authorizeHttpGatewayConnect(
  params: Omit<AuthorizeGatewayConnectParams, "authSurface">,
): Promise<GatewayAuthResult> {
  return authorizeGatewayConnect({
    ...params,
    authSurface: "http",
  });
}

export async function authorizeWsControlUiGatewayConnect(
  params: Omit<AuthorizeGatewayConnectParams, "authSurface">,
): Promise<GatewayAuthResult> {
  return authorizeGatewayConnect({
    ...params,
    authSurface: "ws-control-ui",
  });
}
