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
  let authFailed = false;
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
      console.log(`[bot] Registered with Hanzo Cloud as ${nodeId}`);
    } else if (res.status === 401 || res.status === 403) {
      authFailed = true;
      console.warn(
        `[bot] Cloud registration rejected (${res.status}); stopping heartbeats until re-authenticated`,
      );
    } else {
      console.warn(`[bot] Cloud registration returned ${res.status}`);
    }
  } catch (err) {
    console.warn(
      `[bot] Cloud registration failed (non-fatal):`,
      err instanceof Error ? err.message : err,
    );
  }

  if (authFailed) {
    return () => {};
  }

  // Heartbeat every 30s; stop immediately on 401/403 so expired credentials do
  // not generate an infinite unauthorized heartbeat storm against api.hanzo.bot.
  const interval = setInterval(async () => {
    try {
      const res = await fetch(`${PLAYGROUND_API}/v1/nodes/${nodeId}/heartbeat`, {
        method: "POST",
        headers,
        body: JSON.stringify({ status: "active" }),
      });
      if (res.status === 401 || res.status === 403) {
        clearInterval(interval);
        console.warn(
          `[bot] Cloud heartbeat rejected (${res.status}) for ${nodeId}; stopping heartbeats until re-authenticated`,
        );
      }
    } catch {
      // Heartbeat failures are silent
    }
  }, 30_000);

  // Return cleanup function
  return () => {
    clearInterval(interval);
  };
}
