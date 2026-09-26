/**
 * Local launch — starts the bot gateway on this machine.
 *
 * Flow:
 * 1. On a machine with no bot.json: store IAM credentials so the embedded
 *    agent can call AI models, write a config with gateway.mode = "local" and
 *    the Hanzo API proxy, and start the gateway on loopback with no auth and
 *    Tailscale off.
 * 2. A bot.json that exists (set up earlier, or imported by `migrate
 *    openclaw`) is the person's: it is used as it is, and the gateway starts
 *    as `gateway run` starts it, with that config's bind, auth and Tailscale.
 * 3. Open the Control UI in the user's browser and keep running until Ctrl+C.
 *
 * The IAM access token obtained during OAuth login is used to authenticate
 * API calls to https://api.hanzo.ai which proxies to model providers
 * (Anthropic, OpenAI, etc.) via unified Hanzo Cloud billing.
 */

import os from "node:os";
import { upsertAuthProfile } from "../agents/auth-profiles.js";
import { formatCliCommand } from "../cli/command-format.js";
import { readConfigFileSnapshot, writeConfigFile } from "../config/io.js";
import { resolveGatewayPort } from "../config/paths.js";
import type { GatewayServerOptions } from "../gateway/server.js";
import { resolveDashboardUrl } from "./dashboard.js";
import { HANZO_IAM_ANTHROPIC_PROFILE, hanzoCloudConfig } from "./hanzo-cloud-config.js";
import { openUrl } from "./onboard-helpers.js";

const DEFAULT_PORT = 18789;

export async function launchLocal(params: { accessToken: string }): Promise<void> {
  const { accessToken } = params;
  process.env.HANZO_API_KEY = accessToken;
  const existing = await readConfigFileSnapshot();
  if (existing.exists) {
    // Rewriting it would drop the person's channels, agents and workspace, and
    // pointing their Anthropic provider at the proxy would send their own key there.
    // eslint-disable-next-line no-console
    console.log(`\n  Using your config at ${existing.path}\n`);
    await startLocalGateway(accessToken, resolveGatewayPort(existing.config), {});
    return;
  }
  await writeHanzoCloudConfig(accessToken);
  // Only local processes reach a loopback gateway, so it needs no token; with
  // Tailscale off nothing forwards the tailnet to it.
  await startLocalGateway(accessToken, DEFAULT_PORT, {
    bind: "loopback",
    auth: { mode: "none" },
    tailscale: { mode: "off" },
  });
}

async function writeHanzoCloudConfig(accessToken: string): Promise<void> {
  // 1. Store IAM credentials for the embedded agent.
  //    - Write an api_key auth-profile under the "anthropic" provider so the
  //      agent's model-auth resolver picks it up when calling Claude models.
  //      Using api_key type (not oauth) avoids token-refresh attempts — the
  //      IAM token is used as-is against the Hanzo API proxy.
  //    - Set env vars as fallback for both the embedded agent path
  //      (ANTHROPIC_API_KEY) and the marketplace-proxy path (HANZO_API_KEY).
  try {
    upsertAuthProfile({
      profileId: HANZO_IAM_ANTHROPIC_PROFILE,
      credential: {
        type: "api_key" as const,
        provider: "anthropic",
        key: accessToken,
      },
    });
  } catch {
    // Auth profile write failure is non-fatal — env vars provide fallback.
  }
  process.env.ANTHROPIC_API_KEY = accessToken;

  // 2. Write config for local gateway mode.
  //    - Route Anthropic model requests through the Hanzo API proxy so the
  //      IAM token is accepted (Anthropic's own API would reject it).
  //    - Omit gateway.auth — auth mode is passed as a runtime override to
  //      startGatewayServer() so it doesn't persist "none" to config.
  const config = hanzoCloudConfig(os.homedir());
  await writeConfigFile(config as Parameters<typeof writeConfigFile>[0]);
}

async function startLocalGateway(
  accessToken: string,
  port: number,
  overrides: GatewayServerOptions,
): Promise<void> {
  // eslint-disable-next-line no-console
  console.log("\n  Starting local gateway...\n");
  const viaHanzoCloud = overrides.auth?.mode === "none";

  // Dynamically import gateway dependencies (heavy modules)
  const [{ startGatewayServer }, { runGatewayLoop }, { defaultRuntime }] = await Promise.all([
    import("../gateway/server.js"),
    import("../cli/gateway-cli/run-loop.js"),
    import("../runtime.js"),
  ]);

  // Start gateway loop — this is long-running.
  try {
    await runGatewayLoop({
      runtime: defaultRuntime,
      lockPort: port,
      start: async () => {
        // The overrides are runtime-only and never persisted, so `gateway run`
        // still starts with the config's own auth.
        const server = await startGatewayServer(port, overrides);

        // Read after start: the gateway saves a token it had to generate.
        let url = `http://127.0.0.1:${port}/`;
        let shown = url;
        if (!viaHanzoCloud) {
          const snapshot = await readConfigFileSnapshot();
          const dashboard = await resolveDashboardUrl(snapshot.valid ? snapshot.config : {});
          url = dashboard.url;
          shown = dashboard.httpUrl;
        }
        let opened = false;
        try {
          opened = await openUrl(url);
        } catch {
          // Browser open may fail in headless environments — not fatal
        }

        // eslint-disable-next-line no-console
        console.log(`  Gateway running on ${shown}`);
        // eslint-disable-next-line no-console
        console.log(
          opened
            ? "  Control UI opened in your browser."
            : `  Open the Control UI: ${formatCliCommand("bot dashboard")}`,
        );
        if (viaHanzoCloud) {
          // eslint-disable-next-line no-console
          console.log(`  AI models via Hanzo Cloud (api.hanzo.ai)\n`);
        }

        // Register with Hanzo Cloud so the bot appears on app.hanzo.bot
        try {
          const { registerLocalBot } = await import("./local-cloud-register.js");
          const stopHeartbeat = await registerLocalBot({ accessToken, port });
          process.once("SIGINT", stopHeartbeat);
          process.once("SIGTERM", stopHeartbeat);
        } catch {
          // Cloud registration is best-effort — local bot works without it.
        }

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
