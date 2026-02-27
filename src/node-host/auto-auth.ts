/**
 * Auto-authentication for node host — ensures IAM credentials are available
 * before connecting to the cloud gateway.
 *
 * On first run (no saved credentials), opens a browser for OAuth login via hanzo.id.
 * On subsequent runs, reuses saved credentials from auth-profiles.json.
 */

import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { ensureAuthProfileStore } from "../agents/auth-profiles/store.js";
import { writeOAuthCredentials } from "../commands/onboard-auth.credentials.js";
import { openUrl } from "../commands/onboard-helpers.js";

const HANZO_IAM_AUTHORIZE_ENDPOINT = "https://hanzo.id/login/oauth/authorize";
const HANZO_IAM_TOKEN_ENDPOINT = "https://hanzo.id/api/login/oauth/access_token";
const HANZO_CLIENT_ID = "hanzobot-client-id";
const HANZO_CLIENT_SECRET = "";
const HANZO_REDIRECT_URI = "http://127.0.0.1:1456/oauth-callback";
const HANZO_SCOPES = "openid profile email";
const OAUTH_TIMEOUT_MS = 3 * 60 * 1000;

/** Default cloud gateway WebSocket URL. */
export const CLOUD_GATEWAY_URL = "wss://gw.hanzo.bot";

/**
 * Ensure valid Hanzo IAM credentials exist.
 * Returns the access token if available or after successful login, or null on failure.
 */
export async function ensureCloudAuth(): Promise<string | null> {
  const existing = findExistingIamToken();
  if (existing) {
    return existing;
  }

  // eslint-disable-next-line no-console
  console.log("Hanzo Cloud authentication required.");
  // eslint-disable-next-line no-console
  console.log("Opening browser for sign-in via hanzo.id...");
  // eslint-disable-next-line no-console
  console.log("No account? One will be created automatically.\n");

  try {
    const token = await runBrowserOAuth();
    // eslint-disable-next-line no-console
    console.log("Hanzo Cloud authentication complete.\n");
    return token;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`Authentication failed: ${err instanceof Error ? err.message : String(err)}`);
    // eslint-disable-next-line no-console
    console.error("Set BOT_GATEWAY_TOKEN to authenticate manually.\n");
    return null;
  }
}

/**
 * Search auth-profiles.json for a valid (non-expired) hanzo-iam access token.
 */
function findExistingIamToken(): string | null {
  try {
    const store = ensureAuthProfileStore();
    for (const [profileId, cred] of Object.entries(store.profiles)) {
      if (!profileId.startsWith("hanzo-iam:")) {
        continue;
      }
      if (cred.type !== "oauth") {
        continue;
      }
      const access = (cred as { access?: string }).access?.trim();
      if (!access) {
        continue;
      }
      const expires = (cred as { expires?: number }).expires;
      if (typeof expires === "number" && Date.now() > expires - 60_000) {
        continue;
      }
      return access;
    }
  } catch {
    // Auth store not loadable — proceed with interactive login
  }
  return null;
}

/**
 * Run the full browser OAuth flow:
 * open authorize URL → wait for callback → exchange code → save credentials.
 */
async function runBrowserOAuth(): Promise<string> {
  const state = randomBytes(16).toString("hex");
  const clientId = process.env.HANZO_CLIENT_ID?.trim() || HANZO_CLIENT_ID;
  const redirectUri = process.env.HANZO_OAUTH_REDIRECT_URI?.trim() || HANZO_REDIRECT_URI;
  const qs = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: HANZO_SCOPES,
    state,
  });
  const authorizeUrl = `${HANZO_IAM_AUTHORIZE_ENDPOINT}?${qs.toString()}`;

  const callbackPromise = waitForOAuthCallback(redirectUri, state);

  const opened = await openUrl(authorizeUrl);
  if (!opened) {
    // eslint-disable-next-line no-console
    console.log(`Open this URL in your browser:\n${authorizeUrl}\n`);
  }

  const { code } = await callbackPromise;
  const tokens = await exchangeCodeForTokens(code);

  await writeOAuthCredentials("hanzo-iam", {
    access: tokens.access_token,
    refresh: tokens.refresh_token ?? "",
    expires: tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : 0,
    tokenType: tokens.token_type,
    createdAt: Date.now(),
  });

  process.env.HANZO_API_KEY = tokens.access_token;
  return tokens.access_token;
}

/**
 * Start a temporary local HTTP server to receive the OAuth redirect callback.
 */
function waitForOAuthCallback(
  redirectUri: string,
  expectedState: string,
): Promise<{ code: string; state: string }> {
  const redirectUrl = new URL(redirectUri);
  const hostname = redirectUrl.hostname || "127.0.0.1";
  const port = redirectUrl.port ? Number.parseInt(redirectUrl.port, 10) : 80;
  const expectedPath = redirectUrl.pathname || "/";

  return new Promise<{ code: string; state: string }>((resolve, reject) => {
    let timeout: NodeJS.Timeout | null = null;
    const server = createServer((req, res) => {
      try {
        const requestUrl = new URL(req.url ?? "/", redirectUrl.origin);
        if (requestUrl.pathname !== expectedPath) {
          res.statusCode = 404;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end("Not found");
          return;
        }

        const code = requestUrl.searchParams.get("code")?.trim();
        const state = requestUrl.searchParams.get("state")?.trim();

        if (!code) {
          res.statusCode = 400;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end("Missing authorization code");
          return;
        }
        if (!state || state !== expectedState) {
          res.statusCode = 400;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end("Invalid state parameter");
          return;
        }

        res.statusCode = 200;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end(
          [
            "<!doctype html>",
            "<html><head><meta charset='utf-8' /></head>",
            "<body><h2>Hanzo login complete</h2>",
            "<p>You can close this window and return to Hanzo Bot.</p></body></html>",
          ].join(""),
        );
        if (timeout) {
          clearTimeout(timeout);
        }
        server.close();
        resolve({ code, state });
      } catch (err) {
        if (timeout) {
          clearTimeout(timeout);
        }
        server.close();
        reject(err);
      }
    });

    server.once("error", (err) => {
      if (timeout) {
        clearTimeout(timeout);
      }
      server.close();
      reject(err);
    });

    server.listen(port, hostname);

    timeout = setTimeout(() => {
      try {
        server.close();
      } catch {
        /* ignore close error on timeout */
      }
      reject(new Error("OAuth callback timeout — no response within 3 minutes"));
    }, OAUTH_TIMEOUT_MS);
  });
}

/**
 * Exchange an authorization code for access/refresh tokens via hanzo.id token endpoint.
 */
async function exchangeCodeForTokens(code: string): Promise<{
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in?: number;
}> {
  const clientId = process.env.HANZO_CLIENT_ID?.trim() || HANZO_CLIENT_ID;
  const clientSecret = process.env.HANZO_CLIENT_SECRET?.trim() || HANZO_CLIENT_SECRET;
  const redirectUri = process.env.HANZO_OAUTH_REDIRECT_URI?.trim() || HANZO_REDIRECT_URI;

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
  });

  const res = await fetch(HANZO_IAM_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Hanzo IAM token exchange failed (${res.status}): ${text}`);
  }

  return (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    token_type: string;
    expires_in?: number;
  };
}
