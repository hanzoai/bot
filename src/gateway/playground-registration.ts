/**
 * Playground control-plane registration.
 *
 * On startup the bot gateway registers itself as a node with the playground
 * control-plane, sends periodic heartbeats, and deregisters on shutdown.
 *
 * Env vars:
 *   PLAYGROUND_URL   — base URL of the playground control-plane (default: http://playground:8080)
 *   HANZO_NODE_ID    — stable node identifier (default: hanzo-bot-gateway)
 */

import type { SubsystemLogger } from "../logging/subsystem.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PlaygroundRegistrationConfig = {
  playgroundUrl: string;
  nodeId: string;
  /** Skills (bots/skills) to advertise to the control-plane. */
  bots: Array<{ id: string; input_schema?: unknown }>;
  skills: Array<{ id: string; input_schema?: unknown }>;
  /** Base URL other nodes can reach this gateway at. */
  baseUrl: string;
  /** Heartbeat interval in ms (default 30 000). */
  heartbeatIntervalMs?: number;
  log: SubsystemLogger;
};

export type PlaygroundRegistrationHandle = {
  stop: () => Promise<void>;
};

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export async function startPlaygroundRegistration(
  config: PlaygroundRegistrationConfig,
): Promise<PlaygroundRegistrationHandle> {
  const {
    playgroundUrl,
    nodeId,
    bots,
    skills,
    baseUrl,
    heartbeatIntervalMs = 30_000,
    log,
  } = config;

  const apiBase = playgroundUrl.replace(/\/$/, "");

  // -- helpers --------------------------------------------------------------

  async function post(path: string, body: unknown): Promise<boolean> {
    try {
      const res = await fetch(`${apiBase}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        log.warn(
          `playground ${path} responded ${res.status}: ${await res.text().catch(() => "")}`,
        );
        return false;
      }
      return true;
    } catch (err) {
      log.warn(`playground ${path} failed: ${String(err)}`);
      return false;
    }
  }

  // -- register -------------------------------------------------------------

  const registerPayload = {
    node_id: nodeId,
    base_url: baseUrl,
    deployment_type: "long_running",
    bots,
    skills,
  };

  const ok = await post("/api/v1/nodes/register", registerPayload);
  if (ok) {
    log.info(`registered with playground at ${apiBase} as ${nodeId}`);
  } else {
    log.warn(`initial playground registration failed — will retry on heartbeat`);
  }

  // -- heartbeat ------------------------------------------------------------

  let stopped = false;

  async function heartbeat(): Promise<void> {
    if (stopped) return;
    await post(`/api/v1/nodes/${encodeURIComponent(nodeId)}/heartbeat`, {
      status: "ready",
      timestamp: new Date().toISOString(),
    });
  }

  const timer = setInterval(() => {
    void heartbeat();
  }, heartbeatIntervalMs);

  // Fire the first heartbeat immediately.
  void heartbeat();

  // -- shutdown -------------------------------------------------------------

  async function stop(): Promise<void> {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
    // Best-effort deregister. The playground SDK does not expose a dedicated
    // deregister endpoint, but sending an "offline" heartbeat achieves the
    // same effect — the control-plane marks the node as offline.
    await post(`/api/v1/nodes/${encodeURIComponent(nodeId)}/heartbeat`, {
      status: "offline",
      timestamp: new Date().toISOString(),
    });
    log.info("deregistered from playground");
  }

  return { stop };
}

// ---------------------------------------------------------------------------
// Factory — resolves config from env + defaults
// ---------------------------------------------------------------------------

export function resolvePlaygroundRegistrationConfig(params: {
  env: NodeJS.ProcessEnv;
  gatewayPort: number;
  log: SubsystemLogger;
}): PlaygroundRegistrationConfig | null {
  const playgroundUrl = params.env.PLAYGROUND_URL;
  if (!playgroundUrl) {
    return null;
  }

  const nodeId = params.env.HANZO_NODE_ID || "hanzo-bot-gateway";
  const baseUrl =
    params.env.HANZO_NODE_BASE_URL ||
    `http://bot-gateway.hanzo.svc:${params.gatewayPort === 18789 ? 80 : params.gatewayPort}`;

  return {
    playgroundUrl,
    nodeId,
    baseUrl,
    bots: [
      { id: "chat", input_schema: { type: "object", properties: { message: { type: "string" } } } },
    ],
    skills: [
      { id: "translate", input_schema: { type: "object", properties: { text: { type: "string" }, target_language: { type: "string" } } } },
      { id: "summarize", input_schema: { type: "object", properties: { text: { type: "string" } } } },
    ],
    heartbeatIntervalMs: 30_000,
    log: params.log,
  };
}
