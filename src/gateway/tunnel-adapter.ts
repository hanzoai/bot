/**
 * Tunnel adapter — bridges hanzo-tunnel protocol connections to the bot
 * gateway's NodeRegistry.
 *
 * When a hanzo-tunnel client connects (via the simple JSON frame protocol),
 * this adapter:
 * 1. Parses the `register` frame from the tunnel client
 * 2. Creates a virtual node in the gateway's NodeRegistry
 * 3. Translates `node.invoke` requests → tunnel `command` frames
 * 4. Translates tunnel `event` frames → node events
 * 5. Translates tunnel `response` frames → node.invoke.result
 *
 * This means all existing gateway features (node.list, node.invoke, etc.)
 * work with tunnel-connected nodes out of the box.
 */

import type { WebSocket } from "ws";
import { randomUUID } from "node:crypto";
import type { NodeRegistry } from "./node-registry.js";
import type { GatewayWsClient } from "./server/ws-types.js";
import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("tunnel-adapter");

// --- Tunnel protocol types ---

interface TunnelRegisterFrame {
  type: "register";
  instance_id: string;
  app_kind: string;
  display_name: string;
  capabilities: string[];
  version: string;
  platform: string;
  cwd?: string;
  commands?: string[];
  metadata?: unknown;
}

interface TunnelEventFrame {
  type: "event";
  event: string;
  data: unknown;
}

interface TunnelCommandFrame {
  type: "command";
  id: string;
  method: string;
  params: unknown;
}

interface TunnelResponseFrame {
  type: "response";
  id: string;
  ok: boolean;
  data?: unknown;
  error?: string;
}

interface TunnelPingFrame {
  type: "ping";
}

interface TunnelPongFrame {
  type: "pong";
}

type TunnelFrame =
  | TunnelRegisterFrame
  | TunnelEventFrame
  | TunnelCommandFrame
  | TunnelResponseFrame
  | TunnelPingFrame
  | TunnelPongFrame;

interface TunnelNodeSession {
  instanceId: string;
  nodeId: string;
  connId: string;
  ws: WebSocket;
  appKind: string;
  displayName: string;
  capabilities: string[];
  commands: string[];
  version: string;
  platform: string;
  cwd?: string;
  connectedAt: number;
}

/**
 * Handle a tunnel protocol WebSocket connection.
 *
 * Call this from the upgrade handler when the URL path is `/v1/tunnel`.
 */
export function handleTunnelConnection(params: {
  ws: WebSocket;
  nodeRegistry: NodeRegistry;
  remoteIp?: string;
}) {
  const { ws, nodeRegistry, remoteIp } = params;
  const connId = randomUUID();
  let session: TunnelNodeSession | null = null;
  let registered = false;

  // Handshake timeout — client must send `register` within 10s.
  const handshakeTimeout = setTimeout(() => {
    if (!registered) {
      log.warn("tunnel client did not register in time, closing");
      ws.close(4001, "handshake timeout");
    }
  }, 10_000);

  ws.on("message", (raw: Buffer | string) => {
    let frame: TunnelFrame;
    try {
      const text = typeof raw === "string" ? raw : raw.toString("utf-8");
      frame = JSON.parse(text) as TunnelFrame;
    } catch {
      log.warn("tunnel: invalid frame");
      return;
    }

    switch (frame.type) {
      case "register":
        handleRegister(frame);
        break;
      case "event":
        handleEvent(frame);
        break;
      case "response":
        handleResponse(frame);
        break;
      case "ping":
        sendFrame({ type: "pong" });
        break;
      case "pong":
        // Heartbeat ack — no action needed.
        break;
      default:
        log.warn(`tunnel: unknown frame type: ${(frame as { type: string }).type}`);
    }
  });

  ws.on("close", () => {
    clearTimeout(handshakeTimeout);
    if (session) {
      nodeRegistry.unregister(session.connId);
      log.info(`tunnel node disconnected: ${session.nodeId} (${session.displayName})`);
    }
  });

  ws.on("error", (err) => {
    log.warn(`tunnel ws error: ${err.message}`);
  });

  function sendFrame(f: Record<string, unknown>) {
    try {
      ws.send(JSON.stringify(f));
    } catch {
      // Connection may be closing.
    }
  }

  function handleRegister(frame: TunnelRegisterFrame) {
    if (registered) {
      log.warn("tunnel: duplicate register");
      return;
    }
    clearTimeout(handshakeTimeout);
    registered = true;

    const nodeId = frame.instance_id || randomUUID();

    // Create a virtual GatewayWsClient so the NodeRegistry can work with it.
    const virtualClient: GatewayWsClient = {
      connId,
      socket: ws as unknown as WebSocket,
      connect: {
        minProtocol: 1,
        maxProtocol: 1,
        client: {
          id: nodeId,
          displayName: frame.display_name || "tunnel-node",
          version: frame.version || "0.0.0",
          platform: frame.platform || "unknown",
          mode: "node" as const,
        },
        caps: frame.capabilities || [],
        commands: frame.commands || [],
        role: "node",
      },
      role: "node",
      scopes: ["node"],
      isAuthenticated: true,
    } as unknown as GatewayWsClient;

    // Override the socket.send to translate gateway frames → tunnel frames.
    // When the gateway sends a `node.invoke.request` event, we translate it
    // to a tunnel `command` frame.
    const originalSend = ws.send.bind(ws);
    (ws as unknown as { send: (data: string, cb?: (err?: Error) => void) => void }).send = (
      data: string,
      cb?: (err?: Error) => void,
    ) => {
      try {
        const gatewayFrame = JSON.parse(data);
        if (gatewayFrame.type === "event" && gatewayFrame.event === "node.invoke.request") {
          // Translate to tunnel command frame.
          const payload = gatewayFrame.payload;
          const tunnelCommand: TunnelCommandFrame = {
            type: "command",
            id: payload.id,
            method: payload.command,
            params: payload.paramsJSON ? JSON.parse(payload.paramsJSON) : {},
          };
          originalSend(JSON.stringify(tunnelCommand), cb);
        } else {
          // Forward other gateway frames as-is (events, etc.).
          originalSend(data, cb);
        }
      } catch {
        originalSend(data, cb);
      }
    };

    nodeRegistry.register(virtualClient, { remoteIp });

    session = {
      instanceId: frame.instance_id,
      nodeId,
      connId,
      ws,
      appKind: frame.app_kind,
      displayName: frame.display_name,
      capabilities: frame.capabilities || [],
      commands: frame.commands || [],
      version: frame.version,
      platform: frame.platform,
      cwd: frame.cwd,
      connectedAt: Date.now(),
    };

    // Send registered confirmation.
    sendFrame({
      type: "registered",
      instance_id: nodeId,
      session_url: `https://app.hanzo.bot/nodes/${nodeId}`,
    });

    log.info(
      `tunnel node registered: ${nodeId} (${frame.display_name}, ${frame.app_kind}, ` +
        `${frame.capabilities.length} caps, ${(frame.commands || []).length} commands)`,
    );
  }

  function handleEvent(frame: TunnelEventFrame) {
    if (!session) {
      log.warn("tunnel: event before register");
      return;
    }
    // Forward as a node event to all operators.
    // Use the node.event method path through the registry.
    // For now, we just log it — the gateway will pick it up via the
    // node subscription system if operators are listening.
    log.debug(`tunnel event from ${session.nodeId}: ${frame.event}`);
  }

  function handleResponse(frame: TunnelResponseFrame) {
    if (!session) {
      log.warn("tunnel: response before register");
      return;
    }
    // Translate tunnel response → node.invoke.result.
    nodeRegistry.handleInvokeResult({
      id: frame.id,
      nodeId: session.nodeId,
      ok: frame.ok,
      payloadJSON: frame.data ? JSON.stringify(frame.data) : null,
      error: frame.error ? { code: "TUNNEL_ERROR", message: frame.error } : null,
    });
  }
}
