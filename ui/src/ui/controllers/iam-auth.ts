/**
 * Browser-side IAM auth controller.
 *
 * Wraps {@link BrowserIamSdk} from `@hanzo/iam/browser` to provide
 * PKCE-based login, signup URL, auto-login from stored tokens, and logout.
 */

import { BrowserIamSdk, type BrowserIamConfig } from "@hanzo/iam/browser";
import type { ControlUiBootstrapIamConfig } from "../../../../src/gateway/control-ui-contract.js";

// ---------------------------------------------------------------------------
// Host contract — the subset of BotApp state the controller reads/writes.
// ---------------------------------------------------------------------------

export type IamAuthHost = {
  basePath: string;
  iamConfig: ControlUiBootstrapIamConfig | null;
  settings: { token: string; gatewayUrl: string; sessionKey: string };
  iamUser: { email?: string; name?: string; avatar?: string } | null;
  iamLoggingIn: boolean;
  applySettings(next: IamAuthHost["settings"]): void;
  connectGateway(): void;
};

// ---------------------------------------------------------------------------
// SDK singleton (one per page lifetime)
// ---------------------------------------------------------------------------

let sdk: BrowserIamSdk | null = null;

function getRedirectUri(basePath: string): string {
  const base = basePath ? `${window.location.origin}${basePath}` : window.location.origin;
  return `${base}/iam-callback`;
}

function getSdk(host: IamAuthHost): BrowserIamSdk | null {
  if (!host.iamConfig) {
    return null;
  }
  if (!sdk) {
    const cfg: BrowserIamConfig = {
      serverUrl: host.iamConfig.serverUrl,
      clientId: host.iamConfig.clientId,
      appName: host.iamConfig.appName,
      orgName: host.iamConfig.orgName,
      redirectUri: getRedirectUri(host.basePath),
      scope: host.iamConfig.scopes?.join(" ") ?? "openid profile email",
      storage: localStorage,
    };
    sdk = new BrowserIamSdk(cfg);
  }
  return sdk;
}

// ---------------------------------------------------------------------------
// Public actions
// ---------------------------------------------------------------------------

/** Start the PKCE login flow by redirecting to the IAM authorize endpoint. */
export async function startIamLogin(host: IamAuthHost): Promise<void> {
  const iamSdk = getSdk(host);
  if (!iamSdk) {
    return;
  }
  host.iamLoggingIn = true;
  await iamSdk.signinRedirect();
  // Browser will redirect away; no code after this point.
}

/**
 * Handle the OAuth callback after redirect back from IAM.
 * Detects `?code=` in the current URL, exchanges it for tokens,
 * stores the access token, loads user info, and auto-connects.
 *
 * @returns `true` if a callback was handled.
 */
export async function handleIamCallback(host: IamAuthHost): Promise<boolean> {
  const iamSdk = getSdk(host);
  if (!iamSdk) {
    return false;
  }
  const url = new URL(window.location.href);
  if (!url.searchParams.has("code") && !url.searchParams.has("error")) {
    return false;
  }

  host.iamLoggingIn = true;
  try {
    const tokens = await iamSdk.handleCallback();
    host.applySettings({ ...host.settings, token: tokens.access_token });
    // Clean the callback params from the URL.
    window.history.replaceState({}, "", url.pathname);
    await loadIamUserInfo(host);
    host.connectGateway();
    return true;
  } catch (err) {
    console.error("[iam] callback error:", err);
    return false;
  } finally {
    host.iamLoggingIn = false;
  }
}

/** Return the signup URL for hanzo.id. */
export function getIamSignupUrl(host: IamAuthHost): string | null {
  const iamSdk = getSdk(host);
  if (!iamSdk) {
    return null;
  }
  return iamSdk.getSignupUrl({ enablePassword: true });
}

/** Fetch user info from IAM using the stored access token. */
export async function loadIamUserInfo(host: IamAuthHost): Promise<void> {
  const iamSdk = getSdk(host);
  if (!iamSdk) {
    return;
  }
  try {
    const info = await iamSdk.getUserInfo();
    host.iamUser = {
      email: typeof info.email === "string" ? info.email : undefined,
      name: typeof info.name === "string" ? info.name : undefined,
      avatar: typeof info.picture === "string" ? info.picture : undefined,
    };
  } catch {
    host.iamUser = null;
  }
}

/**
 * Try to restore an IAM session from stored tokens.
 * Refreshes the access token if expired.
 *
 * @returns `true` if a valid session was restored.
 */
export async function tryIamAutoLogin(host: IamAuthHost): Promise<boolean> {
  const iamSdk = getSdk(host);
  if (!iamSdk) {
    return false;
  }
  const token = await iamSdk.getValidAccessToken();
  if (!token) {
    return false;
  }
  host.applySettings({ ...host.settings, token });
  await loadIamUserInfo(host);
  return true;
}

/** Clear all stored tokens and reset IAM state. */
export function iamLogout(host: IamAuthHost): void {
  const iamSdk = getSdk(host);
  if (iamSdk) {
    iamSdk.clearTokens();
  }
  sdk = null;
  host.iamUser = null;
  host.applySettings({ ...host.settings, token: "" });
}
