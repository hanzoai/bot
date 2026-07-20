import type { BotConfig } from "../config/config.js";
import { resolveSecretInputRef } from "../config/types.secrets.js";

export type ExplicitGatewayAuth = {
  token?: string;
};

export type ResolvedGatewayCredentials = {
  token?: string;
};

export type GatewayCredentialMode = "local" | "remote";
export type GatewayCredentialPrecedence = "env-first" | "config-first";
export type GatewayRemoteCredentialPrecedence = "remote-first" | "env-first";
export type GatewayRemoteCredentialFallback = "remote-env-local" | "remote-only";

const GATEWAY_SECRET_REF_UNAVAILABLE_ERROR_CODE = "GATEWAY_SECRET_REF_UNAVAILABLE";

export class GatewaySecretRefUnavailableError extends Error {
  readonly code = GATEWAY_SECRET_REF_UNAVAILABLE_ERROR_CODE;
  readonly path: string;

  constructor(path: string) {
    super(
      [
        `${path} is configured as a secret reference but is unavailable in this command path.`,
        "Fix: set BOT_GATEWAY_TOKEN, pass an explicit --token,",
        "or run a gateway command path that resolves secret references before credential selection.",
      ].join("\n"),
    );
    this.name = "GatewaySecretRefUnavailableError";
    this.path = path;
  }
}

export function isGatewaySecretRefUnavailableError(
  error: unknown,
  expectedPath?: string,
): error is GatewaySecretRefUnavailableError {
  if (!(error instanceof GatewaySecretRefUnavailableError)) {
    return false;
  }
  if (!expectedPath) {
    return true;
  }
  return error.path === expectedPath;
}

export function trimToUndefined(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function firstDefined(values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    if (value) {
      return value;
    }
  }
  return undefined;
}

function throwUnresolvedGatewaySecretInput(path: string): never {
  throw new GatewaySecretRefUnavailableError(path);
}

function readGatewayTokenEnv(
  env: NodeJS.ProcessEnv,
  includeLegacyEnv: boolean,
): string | undefined {
  const primary = trimToUndefined(env.BOT_GATEWAY_TOKEN);
  if (primary) {
    return primary;
  }
  if (!includeLegacyEnv) {
    return undefined;
  }
  return trimToUndefined(env.CLAWDBOT_GATEWAY_TOKEN);
}

export function resolveGatewayCredentialsFromValues(params: {
  configToken?: unknown;
  env?: NodeJS.ProcessEnv;
  includeLegacyEnv?: boolean;
  tokenPrecedence?: GatewayCredentialPrecedence;
}): ResolvedGatewayCredentials {
  const env = params.env ?? process.env;
  const includeLegacyEnv = params.includeLegacyEnv ?? true;
  const envToken = readGatewayTokenEnv(env, includeLegacyEnv);
  const configToken = trimToUndefined(params.configToken);
  const tokenPrecedence = params.tokenPrecedence ?? "env-first";

  const token =
    tokenPrecedence === "config-first"
      ? firstDefined([configToken, envToken])
      : firstDefined([envToken, configToken]);

  return { token };
}

export function resolveGatewayCredentialsFromConfig(params: {
  cfg: BotConfig;
  env?: NodeJS.ProcessEnv;
  explicitAuth?: ExplicitGatewayAuth;
  urlOverride?: string;
  urlOverrideSource?: "cli" | "env";
  modeOverride?: GatewayCredentialMode;
  includeLegacyEnv?: boolean;
  localTokenPrecedence?: GatewayCredentialPrecedence;
  remoteTokenPrecedence?: GatewayRemoteCredentialPrecedence;
  remoteTokenFallback?: GatewayRemoteCredentialFallback;
}): ResolvedGatewayCredentials {
  const env = params.env ?? process.env;
  const includeLegacyEnv = params.includeLegacyEnv ?? true;
  const explicitToken = trimToUndefined(params.explicitAuth?.token);
  if (explicitToken) {
    return { token: explicitToken };
  }
  if (trimToUndefined(params.urlOverride) && params.urlOverrideSource !== "env") {
    return {};
  }
  if (trimToUndefined(params.urlOverride) && params.urlOverrideSource === "env") {
    return resolveGatewayCredentialsFromValues({
      configToken: undefined,
      env,
      includeLegacyEnv,
      tokenPrecedence: "env-first",
    });
  }

  const mode: GatewayCredentialMode =
    params.modeOverride ?? (params.cfg.gateway?.mode === "remote" ? "remote" : "local");
  const remote = params.cfg.gateway?.remote;
  const defaults = params.cfg.secrets?.defaults;
  const authMode = params.cfg.gateway?.auth?.mode;
  const envToken = readGatewayTokenEnv(env, includeLegacyEnv);

  const localTokenRef = resolveSecretInputRef({
    value: params.cfg.gateway?.auth?.token,
    defaults,
  }).ref;
  const remoteTokenRef = resolveSecretInputRef({
    value: remote?.token,
    defaults,
  }).ref;
  const remoteToken = remoteTokenRef ? undefined : trimToUndefined(remote?.token);
  const localToken = localTokenRef ? undefined : trimToUndefined(params.cfg.gateway?.auth?.token);

  const localTokenPrecedence = params.localTokenPrecedence ?? "env-first";

  if (mode === "local") {
    // In local mode, prefer gateway.auth.token, but also accept gateway.remote.token
    // as a fallback for cron commands and other local gateway clients.
    // This allows users in remote mode to use a single token for all operations.
    const fallbackToken = localToken ?? remoteToken;
    const localResolved = resolveGatewayCredentialsFromValues({
      configToken: fallbackToken,
      env,
      includeLegacyEnv,
      tokenPrecedence: localTokenPrecedence,
    });
    const localTokenCanWin =
      authMode === "token" ||
      (authMode !== "none" && authMode !== "trusted-proxy" && !localResolved.token);
    if (localTokenRef && !localResolved.token && !envToken && localTokenCanWin) {
      throwUnresolvedGatewaySecretInput("gateway.auth.token");
    }
    return localResolved;
  }

  const remoteTokenFallback = params.remoteTokenFallback ?? "remote-env-local";
  const remoteTokenPrecedence = params.remoteTokenPrecedence ?? "remote-first";

  const token =
    remoteTokenFallback === "remote-only"
      ? remoteToken
      : remoteTokenPrecedence === "env-first"
        ? firstDefined([envToken, remoteToken, localToken])
        : firstDefined([remoteToken, envToken, localToken]);

  const localTokenCanWin =
    authMode === "token" || (authMode !== "none" && authMode !== "trusted-proxy");
  const localTokenFallbackEnabled = remoteTokenFallback !== "remote-only";
  const localTokenFallback = remoteTokenFallback === "remote-only" ? undefined : localToken;
  if (remoteTokenRef && !token && !envToken && !localTokenFallback) {
    throwUnresolvedGatewaySecretInput("gateway.remote.token");
  }
  if (
    localTokenRef &&
    localTokenFallbackEnabled &&
    !token &&
    !envToken &&
    !remoteToken &&
    localTokenCanWin
  ) {
    throwUnresolvedGatewaySecretInput("gateway.auth.token");
  }

  return { token };
}
