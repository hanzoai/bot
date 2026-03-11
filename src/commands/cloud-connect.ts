import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { isCancel, select } from "@clack/prompts";
import { isRemoteEnvironment } from "./oauth-env.js";
import { writeOAuthCredentials } from "./onboard-auth.credentials.js";
import { openUrl } from "./onboard-helpers.js";

const HANZO_IAM_AUTHORIZE_ENDPOINT = "https://hanzo.id/login/oauth/authorize";
const HANZO_IAM_TOKEN_ENDPOINT = "https://hanzo.id/api/login/oauth/access_token";
const HANZO_CLIENT_ID = "hanzobot-client-id";
const HANZO_REDIRECT_URI = "http://127.0.0.1:1456/oauth-callback";
const HANZO_SCOPES = "openid profile email";

// PKCE (RFC 7636) helpers for public client authentication
function generateCodeVerifier(): string {
  // 32 random bytes → 43 base64url chars (within the 43-128 char range per RFC 7636)
  return randomBytes(32).toString("base64url");
}

function computeCodeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

function buildAuthorizeUrl(state: string, codeChallenge: string): string {
  const qs = new URLSearchParams({
    client_id: process.env.HANZO_CLIENT_ID?.trim() || HANZO_CLIENT_ID,
    redirect_uri: process.env.HANZO_OAUTH_REDIRECT_URI?.trim() || HANZO_REDIRECT_URI,
    response_type: "code",
    scope: HANZO_SCOPES,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });
  return `${HANZO_IAM_AUTHORIZE_ENDPOINT}?${qs.toString()}`;
}

async function waitForCallback(params: {
  redirectUri: string;
  expectedState: string;
  timeoutMs: number;
}): Promise<{ code: string; state: string }> {
  const redirectUrl = new URL(params.redirectUri);
  const hostname = redirectUrl.hostname || "127.0.0.1";
  const port = redirectUrl.port ? Number.parseInt(redirectUrl.port, 10) : 80;
  const expectedPath = redirectUrl.pathname || "/";

  return await new Promise<{ code: string; state: string }>((resolve, reject) => {
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
          res.end("Missing code");
          return;
        }
        if (!state || state !== params.expectedState) {
          res.statusCode = 400;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end("Invalid state");
          return;
        }

        res.statusCode = 200;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end(
          [
            "<!doctype html>",
            "<html><head><meta charset='utf-8' /></head>",
            "<body><h2>Hanzo login complete</h2>",
            "<p>You can close this window and return to your terminal.</p></body></html>",
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
      } catch {}
      reject(new Error("OAuth callback timeout — try running 'hanzo-bot onboard' manually"));
    }, params.timeoutMs);
  });
}

async function exchangeCode(code: string, codeVerifier: string): Promise<{
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in?: number;
}> {
  const clientId = process.env.HANZO_CLIENT_ID?.trim() || HANZO_CLIENT_ID;
  const redirectUri = process.env.HANZO_OAUTH_REDIRECT_URI?.trim() || HANZO_REDIRECT_URI;

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  });

  const res = await fetch(HANZO_IAM_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Hanzo login failed (${res.status}): ${text}`);
  }

  return (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    token_type: string;
    expires_in?: number;
  };
}

async function promptPasteCode(state: string): Promise<{ code: string; state: string }> {
  const readline = await import("node:readline");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question("\n  Paste the redirect URL (or authorization code): ", (input) => {
      rl.close();
      const trimmed = input.trim();
      let code: string;
      try {
        const parsed = new URL(trimmed);
        code = parsed.searchParams.get("code") ?? trimmed;
      } catch {
        code = trimmed;
      }
      resolve({ code, state });
    });
  });
}

/**
 * First-run cloud connect: OAuth to hanzo.id, write remote gateway config.
 * Called when `npx @hanzo/bot` is run with no existing config.
 */
export async function runFirstRunCloudConnect(): Promise<void> {
  const isRemote = isRemoteEnvironment();
  const redirectUri = process.env.HANZO_OAUTH_REDIRECT_URI?.trim() || HANZO_REDIRECT_URI;

  // eslint-disable-next-line no-console
  console.log("\n  Welcome to Hanzo Bot!\n");
  // eslint-disable-next-line no-console
  console.log("  Connecting your machine to Hanzo Cloud...");

  const state = randomBytes(16).toString("hex");
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = computeCodeChallenge(codeVerifier);
  const authorizeUrl = buildAuthorizeUrl(state, codeChallenge);
  const timeoutMs = 3 * 60 * 1000;

  let codeAndState: { code: string; state: string };

  if (isRemote) {
    // SSH/VPS: print URL, user pastes callback manually
    // eslint-disable-next-line no-console
    console.log("\n  Open this URL in your browser to sign in:\n");
    // eslint-disable-next-line no-console
    console.log(`  ${authorizeUrl}\n`);
    codeAndState = await promptPasteCode(state);
  } else {
    // Local: open browser, start callback server
    // eslint-disable-next-line no-console
    console.log("  Opening browser for Hanzo authentication...\n");

    let callbackPromise: Promise<{ code: string; state: string }>;
    try {
      callbackPromise = waitForCallback({ redirectUri, expectedState: state, timeoutMs });
    } catch {
      // Port in use — fall back to manual paste
      // eslint-disable-next-line no-console
      console.log(`  Open this URL in your browser to sign in:\n\n  ${authorizeUrl}\n`);
      codeAndState = await promptPasteCode(state);
      return completeLogin(codeAndState.code, codeVerifier);
    }

    await openUrl(authorizeUrl);
    codeAndState = await callbackPromise;
  }

  await completeLogin(codeAndState.code, codeVerifier);
}

async function completeLogin(code: string, codeVerifier: string): Promise<void> {
  const tokens = await exchangeCode(code, codeVerifier);

  // Store OAuth credentials
  const creds = {
    access: tokens.access_token,
    refresh: tokens.refresh_token ?? "",
    expires: tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : 0,
    tokenType: tokens.token_type,
    createdAt: Date.now(),
  };
  await writeOAuthCredentials("hanzo-iam", creds);

  // Set API key for current process
  process.env.HANZO_API_KEY = tokens.access_token;

  // eslint-disable-next-line no-console
  console.log("  Logged in to Hanzo Cloud\n");

  // Show interactive launch menu — config will be written by the chosen launch path
  await showPostAuthMenu(tokens.access_token);
}

// ---------------------------------------------------------------------------
// Interactive launch menu
// ---------------------------------------------------------------------------

async function showPostAuthMenu(accessToken: string): Promise<void> {
  const choice = await select({
    message: "How would you like to run your bot?",
    options: [
      {
        value: "local" as const,
        label: "Run Locally",
        hint: "Start bot on this machine, visible in Playground",
      },
      {
        value: "cloud" as const,
        label: "Launch in Cloud",
        hint: "Spin up a cloud VM (Digital Ocean Linux)",
      },
    ],
  });

  if (isCancel(choice)) {
    // eslint-disable-next-line no-console
    console.log("  Setup cancelled.\n");
    process.exit(0);
  }

  if (choice === "local") {
    const { launchLocal } = await import("./local-launch.js");
    await launchLocal({ accessToken });
  } else {
    const { launchCloudNode } = await import("./cloud-launch.js");
    await launchCloudNode({ accessToken });
  }
}

/**
 * Launch menu for returning users (config already exists).
 * Reuses saved credentials or re-runs OAuth if expired.
 */
export async function showLaunchMenu(): Promise<void> {
  // Try to find existing IAM token from auth profiles
  let accessToken: string | null = null;
  try {
    const { ensureAuthProfileStore } = await import("../agents/auth-profiles/store.js");
    const store = ensureAuthProfileStore();
    for (const [profileId, cred] of Object.entries(store.profiles)) {
      if (!profileId.startsWith("hanzo-iam:")) {
        continue;
      }
      if ((cred as { type?: string }).type !== "oauth") {
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
      accessToken = access;
      break;
    }
  } catch {
    // Auth store not available — fall through to re-auth
  }

  // Also check environment
  if (!accessToken) {
    accessToken = process.env.HANZO_API_KEY?.trim() || null;
  }

  if (accessToken) {
    process.env.HANZO_API_KEY = accessToken;
    await showPostAuthMenu(accessToken);
  } else {
    // No valid credentials — re-run the full OAuth flow
    await runFirstRunCloudConnect();
  }
}
