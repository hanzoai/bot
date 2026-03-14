/**
 * VNC Tunnel - Node Host Side
 *
 * When the gateway sends a `vnc.tunnel.open` invoke, the node-host:
 * 1. Connects to the local VNC server (default: localhost:5900)
 * 2. Opens a WebSocket to the gateway's /vnc-tunnel endpoint
 * 3. Bridges binary VNC data between the TCP socket and the WebSocket
 *
 * This allows the gateway to proxy VNC from a remote cloud node through
 * a WebSocket tunnel to the browser's noVNC client.
 */

import { createConnection } from "node:net";
import { WebSocket } from "ws";

const DEFAULT_VNC_HOST = process.env.BOT_VNC_HOST?.trim() ?? "127.0.0.1";
const DEFAULT_VNC_PORT = Number(process.env.BOT_VNC_PORT?.trim() ?? 5900);

export type VncTunnelParams = {
  tunnelId: string;
  tunnelUrl: string;
  vncHost?: string;
  vncPort?: number;
};

/**
 * Rewrite the tunnel URL host/protocol to match the node's own gateway URL.
 *
 * The gateway constructs the tunnelUrl from the browser's Host header
 * (e.g. wss://gw.hanzo.bot/vnc-tunnel?tunnelId=...).  Cloud nodes connect
 * to the gateway via an internal K8s service URL (e.g.
 * ws://bot-gateway.hanzo.svc:18789).  Trying to connect back through the
 * public URL would hairpin through Cloudflare/Traefik and often fails.
 *
 * This rewrites the tunnelUrl to use the same host the node already uses
 * for its main gateway connection, keeping the path and query intact.
 */
function rewriteTunnelUrl(tunnelUrl: string): string {
  const gatewayUrl = process.env.BOT_NODE_GATEWAY_URL;
  if (!gatewayUrl) {
    return tunnelUrl;
  }
  try {
    const tunnel = new URL(tunnelUrl);
    // Parse the gateway URL (ws://host:port or wss://host:port)
    const gw = new URL(gatewayUrl);
    tunnel.protocol = gw.protocol === "wss:" ? "wss:" : "ws:";
    tunnel.host = gw.host;
    return tunnel.toString();
  } catch {
    return tunnelUrl;
  }
}

/**
 * Open a VNC tunnel: connect to local VNC server and bridge to gateway tunnel WS.
 * Returns a cleanup function. Non-fatal — errors are logged but not thrown.
 */
export async function openVncTunnel(params: VncTunnelParams): Promise<() => void> {
  const vncHost = params.vncHost ?? DEFAULT_VNC_HOST;
  const vncPort = params.vncPort ?? DEFAULT_VNC_PORT;
  const tunnelUrl = rewriteTunnelUrl(params.tunnelUrl);

  // eslint-disable-next-line no-console
  console.log(`vnc tunnel: opening tcp=${vncHost}:${vncPort} ws=${tunnelUrl}`);

  return new Promise<() => void>((resolve) => {
    let disposed = false;
    let tcp: ReturnType<typeof createConnection> | null = null;
    let ws: WebSocket | null = null;

    const cleanup = () => {
      if (disposed) return;
      disposed = true;
      // eslint-disable-next-line no-console
      console.log("vnc tunnel: cleanup");
      try {
        tcp?.destroy();
      } catch {}
      try {
        ws?.close(1000, "tunnel closed");
      } catch {}
    };

    // Connect to local VNC server via TCP
    tcp = createConnection({ host: vncHost, port: vncPort }, () => {
      if (disposed) {
        tcp?.destroy();
        return;
      }
      // eslint-disable-next-line no-console
      console.log(`vnc tunnel: tcp connected to ${vncHost}:${vncPort}, opening ws to ${tunnelUrl}`);

      // Open WebSocket to gateway tunnel endpoint
      ws = new WebSocket(tunnelUrl, {
        headers: {},
        handshakeTimeout: 10_000,
      });

      ws.on("open", () => {
        // eslint-disable-next-line no-console
        console.log("vnc tunnel: ws open — bridge active");
        if (disposed) {
          ws?.close();
          return;
        }
        let tcpBytes = 0;
        let wsBytes = 0;
        // Bridge: TCP → WS
        tcp!.on("data", (chunk: Buffer) => {
          tcpBytes += chunk.length;
          if (tcpBytes <= chunk.length) {
            // eslint-disable-next-line no-console
            console.log(`vnc tunnel: first tcp data: ${chunk.length} bytes (first 20: ${chunk.subarray(0, 20).toString("utf8").replace(/[^\x20-\x7E]/g, ".")})`);
          }
          if (!disposed && ws?.readyState === WebSocket.OPEN) {
            ws.send(chunk, (err) => {
              if (err && !disposed) {
                // eslint-disable-next-line no-console
                console.warn(`vnc tunnel: ws send error: ${err.message}`);
              }
            });
          }
        });

        // Bridge: WS → TCP
        ws!.on("message", (data) => {
          const buf = data instanceof Buffer ? data : Buffer.from(data as ArrayBuffer);
          wsBytes += buf.length;
          if (wsBytes <= buf.length) {
            // eslint-disable-next-line no-console
            console.log(`vnc tunnel: first ws data: ${buf.length} bytes`);
          }
          if (!disposed && tcp && !tcp.destroyed) {
            tcp.write(buf);
          }
        });

        tcp!.on("end", () => {
          // eslint-disable-next-line no-console
          console.log(`vnc tunnel: tcp end event (tcpBytes=${tcpBytes} wsBytes=${wsBytes})`);
        });

        resolve(cleanup);
      });

      ws.on("error", (err) => {
        if (!disposed) {
          // eslint-disable-next-line no-console
          console.warn(`vnc tunnel: ws error: ${err.message}`);
          cleanup();
        }
        // Resolve anyway so the invoke doesn't hang
        resolve(cleanup);
      });

      ws.on("close", (code, reason) => {
        // eslint-disable-next-line no-console
        console.log(`vnc tunnel: ws close event (code=${code} reason=${reason?.toString()})`);
        if (!disposed) {
          cleanup();
        }
      });
    });

    tcp.on("error", (err) => {
      if (!disposed) {
        // eslint-disable-next-line no-console
        console.warn(`vnc tunnel: tcp error: ${err.message}`);
        cleanup();
      }
      resolve(cleanup);
    });

    tcp.on("close", (hadError) => {
      // eslint-disable-next-line no-console
      console.log(`vnc tunnel: tcp close event (hadError=${hadError})`);
      if (!disposed) {
        cleanup();
      }
    });

    // Timeout if connection doesn't establish
    const timeout = setTimeout(() => {
      if (!disposed) {
        // eslint-disable-next-line no-console
        console.warn(`vnc tunnel: timed out connecting to VNC server`);
        cleanup();
        resolve(cleanup);
      }
    }, 10_000);

    tcp.once("connect", () => clearTimeout(timeout));
  });
}
