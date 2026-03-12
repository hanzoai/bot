/**
 * Local cloud registration — registers a locally running bot with the
 * Hanzo Playground control plane so it appears on app.hanzo.bot/nodes.
 *
 * This is entirely best-effort: if registration or heartbeats fail the
 * local bot continues to work normally.
 */

import { createHash } from "node:crypto";
import os from "node:os";
import { VERSION } from "../version.js";

const PLAYGROUND_API_BASE = "https://api.hanzo.bot/v1";
// Must be well under the server's HeartbeatTTL (15 s) to stay "online".
const HEARTBEAT_INTERVAL_MS = 10_000;

/**
 * Derive a stable node ID from the machine hostname so re-runs of the
 * local bot update the same Playground node instead of creating duplicates.
 */
function deriveNodeId(): string {
  const hostname = os.hostname();
  const hash = createHash("sha256").update(hostname).digest("hex").slice(0, 8);
  return `local-${hash}`;
}

/**
 * Register the local bot with the Playground control plane and start a
 * heartbeat loop.  Returns a cleanup function that stops heartbeats.
 */
export async function registerLocalBot(params: {
  accessToken: string;
  port: number;
}): Promise<() => void> {
  const { accessToken, port } = params;
  const nodeId = deriveNodeId();
  const displayName = `local-${os.hostname().split(".")[0]}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${accessToken}`,
  };

  // ── Register ──────────────────────────────────────────────────────
  const body = {
    id: nodeId,
    base_url: "",
    deployment_type: "long_running",
    version: VERSION,
    health_status: "active",
    lifecycle_status: "ready",
    metadata: {
      platform: process.platform,
      display_name: displayName,
      custom: { local_url: `http://127.0.0.1:${port}` },
    },
  };

  try {
    const res = await fetch(`${PLAYGROUND_API_BASE}/nodes/register`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (res.ok) {
      // eslint-disable-next-line no-console
      console.log(`  Registered with Hanzo Cloud as ${nodeId}`);
      // eslint-disable-next-line no-console
      console.log(`  View in Playground: https://app.hanzo.bot/nodes/${nodeId}\n`);
    } else {
      const text = await res.text().catch(() => "");
      // eslint-disable-next-line no-console
      console.warn(`  Cloud registration returned ${res.status}: ${text}`);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      `  Cloud registration failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // ── Heartbeat loop ────────────────────────────────────────────────
  const heartbeat = async () => {
    try {
      await fetch(`${PLAYGROUND_API_BASE}/nodes/${encodeURIComponent(nodeId)}/heartbeat`, {
        method: "POST",
        headers,
        body: JSON.stringify({ status: "ready" }),
      });
    } catch {
      // Heartbeat failures are silent — the health monitor will handle staleness.
    }
  };

  // Fire an immediate heartbeat so the presence manager has a fresh
  // timestamp right away (registration alone starts a 15 s TTL clock).
  void heartbeat();

  const timer = setInterval(heartbeat, HEARTBEAT_INTERVAL_MS);

  return () => {
    clearInterval(timer);
  };
}
