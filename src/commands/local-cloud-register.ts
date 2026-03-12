// local-cloud-register.ts — registers the local bot with Hanzo Cloud (app.hanzo.bot)
import { createHash } from "node:crypto";
import { hostname } from "node:os";
import { VERSION } from "../version.js";

const PLAYGROUND_API = "https://api.hanzo.bot";

function stableNodeId(): string {
  const hash = createHash("sha256").update(hostname()).digest("hex").slice(0, 12);
  return `local-${hash}`;
}

export async function registerLocalBot(params: {
  accessToken: string;
  port: number;
}): Promise<() => void> {
  const nodeId = stableNodeId();
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${params.accessToken}`,
  };

  // Register with the control plane
  try {
    const res = await fetch(`${PLAYGROUND_API}/v1/nodes/register`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        id: nodeId,
        base_url: "",
        deployment_type: "long_running",
        version: VERSION,
        health_status: "active",
        lifecycle_status: "running",
        metadata: {
          platform: process.platform,
          display_name: hostname(),
          custom: { local_url: `http://127.0.0.1:${params.port}` },
        },
      }),
    });
    if (res.ok) {
      console.log(`[openclaw] Registered with Hanzo Cloud as ${nodeId}`);
    } else {
      console.warn(`[openclaw] Cloud registration returned ${res.status}`);
    }
  } catch (err) {
    console.warn(`[openclaw] Cloud registration failed (non-fatal):`, err instanceof Error ? err.message : err);
  }

  // Heartbeat every 30s
  const interval = setInterval(async () => {
    try {
      await fetch(`${PLAYGROUND_API}/v1/nodes/${nodeId}/heartbeat`, {
        method: "POST",
        headers,
        body: JSON.stringify({ status: "active" }),
      });
    } catch {
      // Heartbeat failures are silent
    }
  }, 30_000);

  // Return cleanup function
  return () => {
    clearInterval(interval);
  };
}
