/**
 * VNC Tunnel - Node Host Side
 *
 * When the gateway sends a `vnc.tunnel.open` invoke, the node-host:
 * 1. Connects to the VNC server via raw TCP (default: 127.0.0.1:5900)
 * 2. Opens a WebSocket to the gateway's /vnc-tunnel endpoint
 * 3. Bridges VNC data between TCP and WebSocket
 *
 * The VNC server (TigerVNC x0vncserver) speaks the RFB protocol correctly:
 * it sends the server version banner immediately after accept(), so no
 * protocol injection or interception is needed.
 */

import { createConnection, type Socket } from "node:net";
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
 * Open a VNC tunnel: connect to local VNC server via TCP and bridge to
 * gateway tunnel WS.
 * Returns a cleanup function. Non-fatal — errors are logged but not thrown.
 */
export async function openVncTunnel(params: VncTunnelParams): Promise<() => void> {
  const vncHost = params.vncHost ?? DEFAULT_VNC_HOST;
  const vncPort = params.vncPort ?? DEFAULT_VNC_PORT;
  const tunnelUrl = rewriteTunnelUrl(params.tunnelUrl);

  // eslint-disable-next-line no-console
  console.log(`vnc tunnel: opening tcp=${vncHost}:${vncPort} gatewayWs=${tunnelUrl}`);

  return new Promise<() => void>((resolve) => {
    let disposed = false;
    let vncTcp: Socket | null = null;
    let gatewayWs: WebSocket | null = null;

    const cleanup = () => {
      if (disposed) return;
      disposed = true;
      // eslint-disable-next-line no-console
      console.log("vnc tunnel: cleanup");
      try {
        vncTcp?.destroy();
      } catch {}
      try {
        gatewayWs?.close(1000, "tunnel closed");
      } catch {}
    };

    // Connect to VNC server via raw TCP
    vncTcp = createConnection({ host: vncHost, port: vncPort }, () => {
      if (disposed) {
        vncTcp?.destroy();
        return;
      }
      // eslint-disable-next-line no-console
      console.log(`vnc tunnel: TCP connected to ${vncHost}:${vncPort}`);

      let vncBytes = 0;
      let gwBytes = 0;

      // Buffer for data from VNC server that arrives before the gateway WS opens.
      // The VNC server responds on localhost in microseconds, but the gateway WS
      // handshake goes over the network and takes much longer. Without buffering,
      // the initial server response (RFB version banner) is lost.
      const pendingVncData: Buffer[] = [];
      let wsReady = false;

      // Register TCP data handler IMMEDIATELY to capture the VNC server's
      // initial RFB version banner before the gateway WS handshake completes.
      vncTcp!.on("data", (data: Buffer) => {
        vncBytes += data.length;
        if (vncBytes <= data.length) {
          // eslint-disable-next-line no-console
          console.log(`vnc tunnel: first vnc→gw data: ${data.length} bytes (first 20: ${data.subarray(0, 20).toString("utf8").replace(/[^\x20-\x7E]/g, ".")})`);
        }
        if (wsReady && !disposed && gatewayWs?.readyState === WebSocket.OPEN) {
          gatewayWs.send(data, (err) => {
            if (err && !disposed) {
              // eslint-disable-next-line no-console
              console.warn(`vnc tunnel: gw send error: ${err.message}`);
            }
          });
        } else if (!disposed) {
          // Buffer data until WS is ready
          pendingVncData.push(Buffer.from(data));
        }
      });

      // Open WebSocket to gateway tunnel endpoint
      gatewayWs = new WebSocket(tunnelUrl, {
        headers: {},
        handshakeTimeout: 10_000,
      });
      gatewayWs.binaryType = "arraybuffer";

      gatewayWs.on("open", () => {
        // eslint-disable-next-line no-console
        console.log("vnc tunnel: gatewayWs open — bridge active");
        if (disposed) {
          gatewayWs?.close();
          return;
        }
        wsReady = true;

        // Flush any data buffered from VNC server while WS was connecting
        if (pendingVncData.length > 0) {
          const totalBytes = pendingVncData.reduce((s, b) => s + b.length, 0);
          // eslint-disable-next-line no-console
          console.log(`vnc tunnel: flushing ${pendingVncData.length} buffered chunks (${totalBytes} bytes) to gateway`);
          for (const buf of pendingVncData) {
            if (!disposed && gatewayWs?.readyState === WebSocket.OPEN) {
              gatewayWs.send(buf);
            }
          }
          pendingVncData.length = 0;
        }

        // Bridge: Gateway (browser WS) → VNC server (TCP)
        gatewayWs!.on("message", (data) => {
          const buf = data instanceof Buffer ? data : Buffer.from(data as ArrayBuffer);
          gwBytes += buf.length;
          if (gwBytes <= buf.length) {
            // eslint-disable-next-line no-console
            console.log(`vnc tunnel: first gw→vnc data: ${buf.length} bytes`);
          }
          if (!disposed && vncTcp && !vncTcp.destroyed) {
            vncTcp.write(buf);
          }
        });

        resolve(cleanup);
      });

      gatewayWs.on("error", (err) => {
        if (!disposed) {
          // eslint-disable-next-line no-console
          console.warn(`vnc tunnel: gatewayWs error: ${err.message}`);
          cleanup();
        }
        resolve(cleanup);
      });

      gatewayWs.on("close", (code, reason) => {
        // eslint-disable-next-line no-console
        console.log(`vnc tunnel: gatewayWs close (code=${code} reason=${reason?.toString()})`);
        if (!disposed) {
          cleanup();
        }
      });
    });

    vncTcp.on("error", (err) => {
      if (!disposed) {
        // eslint-disable-next-line no-console
        console.warn(`vnc tunnel: TCP error: ${err.message}`);
        cleanup();
      }
      resolve(cleanup);
    });

    vncTcp.on("end", () => {
      // eslint-disable-next-line no-console
      console.log("vnc tunnel: TCP connection ended");
      if (!disposed) {
        cleanup();
      }
    });

    vncTcp.on("close", () => {
      // eslint-disable-next-line no-console
      console.log("vnc tunnel: TCP connection closed");
      if (!disposed) {
        cleanup();
      }
    });

    // Timeout if connection doesn't establish
    const timeout = setTimeout(() => {
      if (!disposed) {
        // eslint-disable-next-line no-console
        console.warn("vnc tunnel: timed out connecting to VNC server");
        cleanup();
        resolve(cleanup);
      }
    }, 10_000);

    vncTcp.once("connect", () => clearTimeout(timeout));
  });
}
