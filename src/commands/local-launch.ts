/**
 * Local launch — starts the bot gateway on this machine and registers it
 * as a node on gw.hanzo.bot so it appears in the Hanzo Playground.
 *
 * Flow:
 * 1. Write config with gateway.mode = "local"
 * 2. Start the gateway server (HTTP + WS on port 18789)
 * 3. Connect to wss://gw.hanzo.bot as a remote node
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

  // 1. Write config for local gateway mode
  const config = {
    gateway: {
      mode: "local" as const,
      bind: "loopback" as const,
      auth: { mode: "token" as const },
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
    { NODE_SYSTEM_RUN_COMMANDS, NODE_EXEC_APPROVALS_COMMANDS, NODE_BROWSER_PROXY_COMMAND },
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
  // Inside the `start` callback we also connect to gw.hanzo.bot as a remote node.
  try {
    await runGatewayLoop({
      runtime: defaultRuntime,
      lockPort: port,
      start: async () => {
        const server = await startGatewayServer(port, {
          bind: "loopback",
        });

        // Connect to gw.hanzo.bot as a remote node so this machine
        // appears in the Hanzo Playground.
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
          onConnectError: (err) => {
            // eslint-disable-next-line no-console
            console.error(`  Cloud gateway connect failed: ${err.message}`);
          },
          onClose: (code, reason) => {
            // eslint-disable-next-line no-console
            console.error(`  Cloud gateway closed (${code}): ${reason}`);
          },
        });
        client.start();

        // Open Control UI in browser
        try {
          await openUrl(`http://127.0.0.1:${port}/`);
        } catch {
          // Browser open may fail in headless environments — not fatal
        }

        // eslint-disable-next-line no-console
        console.log(`  Gateway running on http://127.0.0.1:${port}/`);
        // eslint-disable-next-line no-console
        console.log(`  Connected to Hanzo Cloud as "${displayName}"\n`);
        // eslint-disable-next-line no-console
        console.log(`  View your node:    ${PLAYGROUND_NODES_URL}`);
        // eslint-disable-next-line no-console
        console.log(`  Open Playground:   ${PLAYGROUND_URL}\n`);
        // eslint-disable-next-line no-console
        console.log("  Press Ctrl+C to disconnect.\n");

        return server;
      },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`  Gateway failed to start: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}
