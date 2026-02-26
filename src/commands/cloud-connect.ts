import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { writeConfigFile } from "../config/io.js";
import { isRemoteEnvironment } from "./oauth-env.js";
import { writeOAuthCredentials } from "./onboard-auth.credentials.js";
import { openUrl } from "./onboard-helpers.js";

const HANZO_IAM_AUTHORIZE_ENDPOINT = "https://hanzo.id/login/oauth/authorize";
const HANZO_IAM_TOKEN_ENDPOINT = "https://hanzo.id/api/login/oauth/access_token";
const HANZO_CLIENT_ID = "hanzobot-client-id";
const HANZO_CLIENT_SECRET = "";
const HANZO_REDIRECT_URI = "http://127.0.0.1:1456/oauth-callback";
const HANZO_SCOPES = "openid profile email";
const HANZO_GATEWAY_URL = "wss://gw.hanzo.bot";
const PLAYGROUND_NODES_URL = "https://app.hanzo.bot/nodes";
const PLAYGROUND_URL = "https://app.hanzo.bot/playground";

function buildAuthorizeUrl(state: string): string {
  const qs = new URLSearchParams({
    client_id: process.env.HANZO_CLIENT_ID?.trim() || HANZO_CLIENT_ID,
    redirect_uri: process.env.HANZO_OAUTH_REDIRECT_URI?.trim() || HANZO_REDIRECT_URI,
    response_type: "code",
    scope: HANZO_SCOPES,
    state,
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

async function exchangeCode(code: string): Promise<{
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
  const authorizeUrl = buildAuthorizeUrl(state);
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
      return completeLogin(codeAndState.code);
    }

    await openUrl(authorizeUrl);
    codeAndState = await callbackPromise;
  }

  await completeLogin(codeAndState.code);
}

async function completeLogin(code: string): Promise<void> {
  const tokens = await exchangeCode(code);

  // Store OAuth credentials
  const creds = {
    access: tokens.access_token,
    refresh: tokens.refresh_token ?? "",
    expires: tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : 0,
    tokenType: tokens.token_type,
    createdAt: Date.now(),
  };
  await writeOAuthCredentials("hanzo-iam", creds);

  // Write config for remote gateway connection
  const config = {
    gateway: {
      mode: "remote" as const,
      remote: {
        url: process.env.HANZO_GATEWAY_URL?.trim() || HANZO_GATEWAY_URL,
        token: tokens.access_token,
      },
      auth: { mode: "token" as const },
    },
    agents: {
      defaults: {
        workspace: path.join(os.homedir(), ".hanzo", "bot", "workspace"),
      },
    },
  };
  await writeConfigFile(config as Parameters<typeof writeConfigFile>[0]);

  // Set API key for current process
  process.env.HANZO_API_KEY = tokens.access_token;

  // Show success and playground links
  // eslint-disable-next-line no-console
  console.log("  Logged in to Hanzo Cloud\n");
  // eslint-disable-next-line no-console
  console.log(`  View your node:    ${PLAYGROUND_NODES_URL}`);
  // eslint-disable-next-line no-console
  console.log(`  Open Playground:   ${PLAYGROUND_URL}\n`);
  // eslint-disable-next-line no-console
  console.log("  Your machine will appear in the Playground momentarily.");
  // eslint-disable-next-line no-console
  console.log("  Press Ctrl+C to disconnect.\n");
}
