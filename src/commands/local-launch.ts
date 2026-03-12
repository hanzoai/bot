/**
 * Local launch — starts the bot gateway on this machine.
 *
 * Flow:
 * 1. Write config with gateway.mode = "local"
 * 2. Start the gateway server (HTTP + WS on port 18789) with no auth (loopback-only)
 * 3. Open the Control UI in the user's browser
 * 4. Keep running until Ctrl+C
 *
 * Cloud Playground registration (connecting to wss://gw.hanzo.bot so the bot
 * appears in app.hanzo.bot) will be enabled in a future release once the cloud
 * gateway accepts IAM OAuth tokens for node registration.
 */

import os from "node:os";
import path from "node:path";
import { writeConfigFile } from "../config/io.js";
import { openUrl } from "./onboard-helpers.js";

const DEFAULT_PORT = 18789;

export async function launchLocal(params: { accessToken: string }): Promise<void> {
  // accessToken is saved for future use when cloud registration is enabled.
  const { accessToken: _accessToken } = params;

  // 1. Write config for local gateway mode.
  //    We intentionally omit gateway.auth here — auth mode is passed as a
  //    runtime override to startGatewayServer() so it doesn't persist a
  //    "none" auth mode that would affect other gateway commands.
  const config = {
    gateway: {
      mode: "local" as const,
      bind: "loopback" as const,
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

  // 2. Dynamically import gateway dependencies (heavy modules)
  const [{ startGatewayServer }, { runGatewayLoop }, { defaultRuntime }] = await Promise.all([
    import("../gateway/server.js"),
    import("../cli/gateway-cli/run-loop.js"),
    import("../runtime.js"),
  ]);

  const port = DEFAULT_PORT;

  // 3. Start gateway loop — this is long-running.
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
        console.log(`  Control UI opened in your browser.\n`);
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
