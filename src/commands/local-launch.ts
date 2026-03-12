/**
 * Local launch — starts the bot gateway on this machine.
 *
 * Flow:
 * 1. Store IAM credentials so the embedded agent can call AI models
 * 2. Write config with gateway.mode = "local" and Hanzo API proxy
 * 3. Start the gateway server (HTTP + WS on port 18789) with no auth (loopback-only)
 * 4. Open the Control UI in the user's browser
 * 5. Keep running until Ctrl+C
 *
 * The IAM access token obtained during OAuth login is used to authenticate
 * API calls to https://api.hanzo.ai which proxies to model providers
 * (Anthropic, OpenAI, etc.) via unified Hanzo Cloud billing.
 */

import os from "node:os";
import path from "node:path";
import { writeConfigFile } from "../config/io.js";
import { openUrl } from "./onboard-helpers.js";
import { writeOAuthCredentials } from "./onboard-auth.credentials.js";

/** Hanzo API proxy endpoint — accepts IAM tokens, proxies to model providers. */
const HANZO_API_BASE_URL = "https://api.hanzo.ai";
const DEFAULT_PORT = 18789;

export async function launchLocal(params: { accessToken: string }): Promise<void> {
  const { accessToken } = params;

  // 1. Store IAM credentials for the embedded agent.
  //    - Write an OAuth auth-profile under the "anthropic" provider so the
  //      agent's model-auth resolver picks it up when calling Claude models.
  //    - Set env vars as fallback for both the embedded agent path
  //      (ANTHROPIC_API_KEY) and the marketplace-proxy path (HANZO_API_KEY).
  try {
    await writeOAuthCredentials("anthropic", {
      access: accessToken,
      refresh: "",
      expires: 0,
      tokenType: "Bearer",
      createdAt: Date.now(),
    });
  } catch {
    // Auth profile write failure is non-fatal — env vars provide fallback.
  }
  process.env.ANTHROPIC_API_KEY = accessToken;
  process.env.HANZO_API_KEY = accessToken;

  // 2. Write config for local gateway mode.
  //    - Route Anthropic model requests through the Hanzo API proxy so the
  //      IAM token is accepted (Anthropic's own API would reject it).
  //    - Omit gateway.auth — auth mode is passed as a runtime override to
  //      startGatewayServer() so it doesn't persist "none" to config.
  const config = {
    gateway: {
      mode: "local" as const,
      bind: "loopback" as const,
    },
    models: {
      providers: {
        anthropic: {
          baseUrl: HANZO_API_BASE_URL,
          models: [],
        },
      },
    },
    agents: {
      defaults: {
        workspace: path.join(os.homedir(), ".hanzo", "bot", "workspace"),
      },
    },
  };
  await writeConfigFile(config as Parameters<typeof writeConfigFile>[0]);

  // eslint-disable-next-line no-console
  console.log("\n  Starting local gateway...\n");

  // 3. Dynamically import gateway dependencies (heavy modules)
  const [{ startGatewayServer }, { runGatewayLoop }, { defaultRuntime }] = await Promise.all([
    import("../gateway/server.js"),
    import("../cli/gateway-cli/run-loop.js"),
    import("../runtime.js"),
  ]);

  const port = DEFAULT_PORT;

  // 4. Start gateway loop — this is long-running.
  try {
    await runGatewayLoop({
      runtime: defaultRuntime,
      lockPort: port,
      start: async () => {
        // Start the gateway with auth disabled.  We bind to loopback only,
        // so only local processes can connect — no token needed.  The auth
        // override is a runtime-only option and does NOT get persisted to
        // the config file, so `openclaw gateway run` still defaults to
        // token auth on subsequent invocations.
        const server = await startGatewayServer(port, {
          bind: "loopback",
          auth: { mode: "none" as const },
        });

        // Open Control UI in browser — no token required.
        try {
          await openUrl(`http://127.0.0.1:${port}/`);
        } catch {
          // Browser open may fail in headless environments — not fatal
        }

        // eslint-disable-next-line no-console
        console.log(`  Gateway running on http://127.0.0.1:${port}/`);
        // eslint-disable-next-line no-console
        console.log(`  Control UI opened in your browser.`);
        // eslint-disable-next-line no-console
        console.log(`  AI models via Hanzo Cloud (api.hanzo.ai)\n`);
        // eslint-disable-next-line no-console
        console.log("  Press Ctrl+C to stop the gateway.\n");

        return server;
      },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`  Gateway failed to start: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}
