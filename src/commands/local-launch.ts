/**
 * Local launch — starts the bot gateway on this machine and registers it
 * as a node on gw.hanzo.bot so it appears in the Hanzo Playground.
 *
 * Flow:
 * 1. Write config with gateway.mode = "local"
 * 2. Start the gateway server (HTTP + WS on port 18789) with no auth (loopback-only)
 * 3. Attempt cloud registration on wss://gw.hanzo.bot (non-blocking)
 * 4. Open the Control UI in the user's browser
 * 5. Keep running until Ctrl+C
 */

import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { writeConfigFile } from "../config/io.js";
import { openUrl } from "./onboard-helpers.js";

const CLOUD_GATEWAY_URL = "wss://gw.hanzo.bot";
const PLAYGROUND_NODES_URL = "https://app.hanzo.bot/nodes";
const PLAYGROUND_URL = "https://app.hanzo.bot/playground";
const DEFAULT_PORT = 18789;

export async function launchLocal(params: { accessToken: string }): Promise<void> {
  const { accessToken } = params;

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

  // 2. Dynamically import gateway/node-host dependencies (heavy modules)
  const [
    { startGatewayServer },
    { GatewayClient },
    { runGatewayLoop },
    { getMachineDisplayName },
    { loadOrCreateDeviceIdentity },
    { VERSION },
    { GATEWAY_CLIENT_MODES, GATEWAY_CLIENT_NAMES },
    { NODE_SYSTEM_RUN_COMMANDS, NODE_EXEC_APPROVALS_COMMANDS },
    { defaultRuntime },
  ] = await Promise.all([
    import("../gateway/server.js"),
    import("../gateway/client.js"),
    import("../cli/gateway-cli/run-loop.js"),
    import("../infra/machine-name.js"),
    import("../infra/device-identity.js"),
    import("../version.js"),
    import("../utils/message-channel.js"),
    import("../infra/node-commands.js"),
    import("../runtime.js"),
  ]);

  const port = DEFAULT_PORT;
  const displayName = await getMachineDisplayName();
  const nodeId = randomUUID();

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

        // Open Control UI in browser — no token required now.
        try {
          await openUrl(`http://127.0.0.1:${port}/`);
        } catch {
          // Browser open may fail in headless environments — not fatal
        }

        // eslint-disable-next-line no-console
        console.log(`  Gateway running on http://127.0.0.1:${port}/`);
        // eslint-disable-next-line no-console
        console.log(`  Control UI opened in your browser.\n`);

        // Attempt to register with the Hanzo Cloud gateway.
        // This is best-effort — the cloud gateway may not be available or
        // may not accept the IAM token yet.  Failure here does not affect
        // the local gateway experience.
        let cloudConnected = false;
        try {
          const client = new GatewayClient({
            url: CLOUD_GATEWAY_URL,
            token: accessToken,
            instanceId: nodeId,
            clientName: GATEWAY_CLIENT_NAMES.NODE_HOST,
            clientDisplayName: displayName,
            clientVersion: VERSION,
            platform: process.platform,
            mode: GATEWAY_CLIENT_MODES.NODE,
            role: "node",
            scopes: [],
            caps: ["system"],
            commands: [...NODE_SYSTEM_RUN_COMMANDS, ...NODE_EXEC_APPROVALS_COMMANDS],
            deviceIdentity: loadOrCreateDeviceIdentity(),
            onConnectError: (_err) => {
              if (!cloudConnected) {
                // Only log the first failure, not repeated reconnect attempts
                // eslint-disable-next-line no-console
                console.log(
                  "  Cloud Playground registration unavailable — running in local-only mode.",
                );
                // eslint-disable-next-line no-console
                console.log(
                  "  (Your bot works locally; Playground visibility will be added in a future update.)\n",
                );
              }
            },
            onClose: (_code, _reason) => {
              // Silently handle cloud gateway disconnection
              cloudConnected = false;
            },
          });
          client.start();
        } catch {
          // Cloud registration is entirely optional — swallow any startup errors.
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
