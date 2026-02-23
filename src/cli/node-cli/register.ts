import type { Command } from "commander";
import { loadNodeHostConfig } from "../../node-host/config.js";
import { runNodeHost } from "../../node-host/runner.js";
import { formatDocsLink } from "../../terminal/links.js";
import { theme } from "../../terminal/theme.js";
import { parsePort } from "../daemon-cli/shared.js";
import { formatHelpExamples } from "../help-format.js";
import {
  runNodeDaemonInstall,
  runNodeDaemonRestart,
  runNodeDaemonStatus,
  runNodeDaemonStop,
  runNodeDaemonUninstall,
} from "./daemon.js";

function parsePortWithFallback(value: unknown, fallback: number): number {
  const parsed = parsePort(value);
  return parsed ?? fallback;
}

async function startNodeHost(opts: Record<string, unknown>) {
  const existing = await loadNodeHostConfig();
  const host = (opts.host as string | undefined)?.trim() || existing?.gateway?.host || "127.0.0.1";
  const port = parsePortWithFallback(opts.port, existing?.gateway?.port ?? 18789);
  await runNodeHost({
    gatewayHost: host,
    gatewayPort: port,
    gatewayTls: Boolean(opts.tls) || Boolean(opts.tlsFingerprint),
    gatewayTlsFingerprint: opts.tlsFingerprint as string | undefined,
    nodeId: opts.nodeId as string | undefined,
    displayName: (opts.displayName || opts.name) as string | undefined,
  });
}

export function registerNodeCli(program: Command) {
  const node = program
    .command("node")
    .description("Run and manage the headless node host service")
    .option("--host <host>", "Gateway host")
    .option("--port <port>", "Gateway port")
    .option("--tls", "Use TLS for the gateway connection", false)
    .option("--tls-fingerprint <sha256>", "Expected TLS certificate fingerprint (sha256)")
    .option("--node-id <id>", "Override node id (clears pairing token)")
    .option("--display-name <name>", "Override node display name")
    .option("--name <name>", "Node display name (alias for --display-name)")
    .option("--space <id>", "Space ID to connect to")
    .addHelpText(
      "after",
      () =>
        `\n${theme.heading("Examples:")}\n${formatHelpExamples([
          ["hanzo-bot node", "Run the node host (default: foreground connect mode)."],
          ["hanzo-bot node run --host 127.0.0.1 --port 18789", "Run with explicit gateway."],
          ["hanzo-bot node --name my-bot", "Run with a custom display name."],
          ["hanzo-bot node status", "Check node host service status."],
          ["hanzo-bot node install", "Install the node host service."],
          ["hanzo-bot node restart", "Restart the installed node host service."],
        ])}\n\n${theme.muted("Docs:")} ${formatDocsLink("/cli/node", "docs.hanzo.bot/cli/node")}\n`,
    );

  // Default action: `hanzo-bot node` (no subcommand) → run in foreground
  node.action(async (opts) => {
    await startNodeHost(opts);
  });

  node
    .command("run")
    .description("Run the headless node host (foreground)")
    .option("--host <host>", "Gateway host")
    .option("--port <port>", "Gateway port")
    .option("--tls", "Use TLS for the gateway connection", false)
    .option("--tls-fingerprint <sha256>", "Expected TLS certificate fingerprint (sha256)")
    .option("--node-id <id>", "Override node id (clears pairing token)")
    .option("--display-name <name>", "Override node display name")
    .option("--name <name>", "Node display name (alias for --display-name)")
    .action(async (opts) => {
      await startNodeHost(opts);
    });

  node
    .command("status")
    .description("Show node host status")
    .option("--json", "Output JSON", false)
    .action(async (opts) => {
      await runNodeDaemonStatus(opts);
    });

  node
    .command("install")
    .description("Install the node host service (launchd/systemd/schtasks)")
    .option("--host <host>", "Gateway host")
    .option("--port <port>", "Gateway port")
    .option("--tls", "Use TLS for the gateway connection", false)
    .option("--tls-fingerprint <sha256>", "Expected TLS certificate fingerprint (sha256)")
    .option("--node-id <id>", "Override node id (clears pairing token)")
    .option("--display-name <name>", "Override node display name")
    .option("--runtime <runtime>", "Service runtime (node|bun). Default: node")
    .option("--force", "Reinstall/overwrite if already installed", false)
    .option("--json", "Output JSON", false)
    .action(async (opts) => {
      await runNodeDaemonInstall(opts);
    });

  node
    .command("uninstall")
    .description("Uninstall the node host service (launchd/systemd/schtasks)")
    .option("--json", "Output JSON", false)
    .action(async (opts) => {
      await runNodeDaemonUninstall(opts);
    });

  node
    .command("stop")
    .description("Stop the node host service (launchd/systemd/schtasks)")
    .option("--json", "Output JSON", false)
    .action(async (opts) => {
      await runNodeDaemonStop(opts);
    });

  node
    .command("restart")
    .description("Restart the node host service (launchd/systemd/schtasks)")
    .option("--json", "Output JSON", false)
    .action(async (opts) => {
      await runNodeDaemonRestart(opts);
    });
}
