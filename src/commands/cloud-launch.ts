/**
 * Cloud launch — provisions a cloud VM via the Hanzo Playground control plane
 * and monitors it until it's running. The VM connects to gw.hanzo.bot
 * so it appears in the Playground.
 *
 * Flow:
 * 1. POST to Playground API to provision a Linux cloud node
 * 2. Poll until the node is running
 * 3. Print playground + remote access URLs
 * 4. Write remote gateway config
 * 5. Stay alive showing node status; Ctrl+C offers to deprovision
 */

import os from "node:os";
import path from "node:path";
import { writeConfigFile } from "../config/io.js";

const PLAYGROUND_API_BASE = "https://api.hanzo.bot/v1";
const PLAYGROUND_NODES_URL = "https://app.hanzo.bot/nodes";
const CLOUD_GATEWAY_URL = "wss://gw.hanzo.bot";
const BILLING_URL = "https://billing.hanzo.ai";

// Mirrors ProvisionRequest from playground/control-plane/internal/cloud/provisioner.go
interface CloudProvisionRequest {
  node_id?: string;
  display_name: string;
  model: string;
  os: string;
  provider?: string;
  instance_type?: string;
  cpu?: string;
  memory?: string;
}

// Mirrors ProvisionResult from provisioner.go
interface CloudProvisionResult {
  node_id: string;
  pod_name: string;
  namespace: string;
  node_type: string;
  status: string;
  endpoint?: string;
  created_at: string;
}

// Mirrors CloudNode from provisioner.go
interface CloudNode {
  node_id: string;
  pod_name: string;
  namespace: string;
  node_type: string;
  status: string;
  image: string;
  endpoint: string;
  owner: string;
  org: string;
  os: string;
  remote_protocol: string;
  remote_url: string;
  labels: Record<string, string>;
  created_at: string;
  last_seen: string;
}

async function provisionNode(
  accessToken: string,
  req: CloudProvisionRequest,
): Promise<CloudProvisionResult> {
  const res = await fetch(`${PLAYGROUND_API_BASE}/cloud/nodes/provision`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(req),
  });

  if (res.status === 402 || res.status === 403) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Insufficient credits or billing not configured.\n` +
        `  Add a payment method or claim your $5 signup credit at:\n` +
        `  ${BILLING_URL}\n` +
        (text ? `  (${text})` : ""),
    );
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Provisioning failed (${res.status}): ${text}`);
  }

  return (await res.json()) as CloudProvisionResult;
}

async function getNodeStatus(accessToken: string, nodeId: string): Promise<CloudNode | null> {
  const res = await fetch(`${PLAYGROUND_API_BASE}/cloud/nodes/${encodeURIComponent(nodeId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    return null;
  }
  return (await res.json()) as CloudNode;
}

async function deprovisionNode(accessToken: string, nodeId: string): Promise<boolean> {
  const res = await fetch(`${PLAYGROUND_API_BASE}/cloud/nodes/${encodeURIComponent(nodeId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return res.ok;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function launchCloudNode(params: { accessToken: string }): Promise<void> {
  const { accessToken } = params;
  const { spinner } = await import("@clack/prompts");

  const s = spinner();

  // Generate a display name from the machine hostname
  const displayName = `cloud-${os.hostname().split(".")[0]}-${Date.now().toString(36).slice(-4)}`;

  s.start("Provisioning cloud node (Digital Ocean Linux)...");

  let result: CloudProvisionResult;
  try {
    result = await provisionNode(accessToken, {
      display_name: displayName,
      model: "hanzo-dev",
      os: "linux",
    });
  } catch (err) {
    s.stop(`Provisioning failed`, 1);
    // eslint-disable-next-line no-console
    console.error(`\n  ${err instanceof Error ? err.message : String(err)}\n`);
    return;
  }

  const nodeId = result.node_id;
  s.message(`Node ${nodeId} created — waiting for it to start...`);

  // Poll until running or timeout (2 minutes)
  const timeoutMs = 2 * 60 * 1000;
  const pollIntervalMs = 3000;
  const startTime = Date.now();
  let node: CloudNode | null = null;

  while (Date.now() - startTime < timeoutMs) {
    await sleep(pollIntervalMs);
    node = await getNodeStatus(accessToken, nodeId);
    if (node?.status === "running") {
      break;
    }
    if (node?.status === "failed") {
      s.stop("Node provisioning failed", 1);
      // eslint-disable-next-line no-console
      console.error("  The cloud node failed to start. Check the Playground dashboard for details.\n");
      return;
    }
  }

  if (!node || node.status !== "running") {
    s.stop("Timed out waiting for node to start", 1);
    // eslint-disable-next-line no-console
    console.error("  The node is still provisioning. Check the Playground dashboard:\n");
    // eslint-disable-next-line no-console
    console.error(`  ${PLAYGROUND_NODES_URL}/${nodeId}\n`);
    return;
  }

  s.stop("Cloud node is running!");

  // eslint-disable-next-line no-console
  console.log(`\n  Node ID:           ${nodeId}`);
  // eslint-disable-next-line no-console
  console.log(`  Status:            ${node.status}`);
  // eslint-disable-next-line no-console
  console.log(`  OS:                ${node.os || "linux"}`);
  if (node.remote_protocol) {
    // eslint-disable-next-line no-console
    console.log(`  Remote Access:     ${node.remote_protocol.toUpperCase()}`);
  }
  if (node.remote_url) {
    // eslint-disable-next-line no-console
    console.log(`  Remote URL:        ${node.remote_url}`);
  }
  // eslint-disable-next-line no-console
  console.log(`\n  View in Playground: ${PLAYGROUND_NODES_URL}/${nodeId}`);
  // eslint-disable-next-line no-console
  console.log(`  Billing & Credits:  ${BILLING_URL}\n`);

  // Write config for remote gateway mode
  const config = {
    gateway: {
      mode: "remote" as const,
      remote: {
        url: CLOUD_GATEWAY_URL,
        token: accessToken,
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

  // eslint-disable-next-line no-console
  console.log("  Press Ctrl+C to disconnect (the cloud node will keep running).\n");

  // Keep alive with periodic status polling
  const statusInterval = setInterval(async () => {
    try {
      const status = await getNodeStatus(accessToken, nodeId);
      if (status && status.status !== "running") {
        // eslint-disable-next-line no-console
        console.log(`  Node status changed: ${status.status}`);
      }
    } catch {
      // Ignore polling errors
    }
  }, 30_000);

  // Handle Ctrl+C — ask whether to deprovision
  await new Promise<void>((resolve) => {
    const cleanup = () => {
      clearInterval(statusInterval);
      resolve();
    };

    process.on("SIGINT", async () => {
      // eslint-disable-next-line no-console
      console.log("\n");

      const readline = await import("node:readline");
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

      rl.question(
        "  Stop and remove the cloud node? (y/N): ",
        async (answer) => {
          rl.close();
          if (answer.trim().toLowerCase() === "y") {
            // eslint-disable-next-line no-console
            console.log("  Deprovisioning node...");
            const ok = await deprovisionNode(accessToken, nodeId);
            if (ok) {
              // eslint-disable-next-line no-console
              console.log("  Node removed.\n");
            } else {
              // eslint-disable-next-line no-console
              console.error("  Failed to remove node. Remove it from the Playground dashboard.\n");
            }
          } else {
            // eslint-disable-next-line no-console
            console.log(`  Node ${nodeId} is still running in the cloud.`);
            // eslint-disable-next-line no-console
            console.log(`  Manage it at: ${PLAYGROUND_NODES_URL}/${nodeId}\n`);
          }
          cleanup();
          process.exit(0);
        },
      );
    });

    process.on("SIGTERM", () => {
      cleanup();
      process.exit(0);
    });
  });
}
