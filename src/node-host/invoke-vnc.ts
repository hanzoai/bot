/**
 * VNC Tunnel - Node Host Side
 *
 * When the gateway sends a `vnc.tunnel.open` invoke, the node-host:
 * 1. Connects to the local websockify server via WebSocket (default: ws://127.0.0.1:6080)
 * 2. Opens a WebSocket to the gateway's /vnc-tunnel endpoint
 * 3. Bridges binary VNC data between the two WebSocket connections
 *
 * Why websockify (port 6080) instead of x11vnc (port 5900)?
 * - x11vnc 0.9.16 (LibVNCServer) has WebSocket auto-detection on port 5900
 *   but its implementation is too basic for the `ws` npm library's handshake
 * - Raw TCP to port 5900 also fails because LibVNCServer blocks on recv(MSG_PEEK)
 *   waiting for client data to detect WebSocket vs RFB, but RFB requires the
 *   server to speak first — creating a deadlock
 * - websockify on port 6080 is a proper WebSocket server that bridges to
 *   x11vnc:5900 via TCP, handling the protocol correctly
 */

import { WebSocket } from "ws";

const DEFAULT_VNC_HOST = process.env.BOT_VNC_HOST?.trim() ?? "127.0.0.1";
const DEFAULT_VNC_PORT = Number(process.env.BOT_VNC_PORT?.trim() ?? 6080);

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
 * Open a VNC tunnel: connect to local VNC server via WebSocket and bridge
 * to gateway tunnel WS.
 * Returns a cleanup function. Non-fatal — errors are logged but not thrown.
 */
export async function openVncTunnel(params: VncTunnelParams): Promise<() => void> {
  const vncHost = params.vncHost ?? DEFAULT_VNC_HOST;
  const vncPort = params.vncPort ?? DEFAULT_VNC_PORT;
  const tunnelUrl = rewriteTunnelUrl(params.tunnelUrl);
  const vncWsUrl = `ws://${vncHost}:${vncPort}`;

  // eslint-disable-next-line no-console
  console.log(`vnc tunnel: opening vncWs=${vncWsUrl} gatewayWs=${tunnelUrl}`);

  return new Promise<() => void>((resolve) => {
    let disposed = false;
    let vncWs: WebSocket | null = null;
    let gatewayWs: WebSocket | null = null;

    const cleanup = () => {
      if (disposed) return;
      disposed = true;
      // eslint-disable-next-line no-console
      console.log("vnc tunnel: cleanup");
      try {
        vncWs?.close(1000, "tunnel closed");
      } catch {}
      try {
        gatewayWs?.close(1000, "tunnel closed");
      } catch {}
    };

    // Connect to local VNC server via WebSocket
    // x11vnc (with LibVNCServer) supports WebSocket natively on its RFB port.
    // Using WebSocket avoids the protocol auto-detection deadlock that occurs
    // with raw TCP connections (LibVNCServer waits for client data to detect
    // WebSocket vs RFB, but RFB requires the server to speak first).
    vncWs = new WebSocket(vncWsUrl, {
      headers: {},
      handshakeTimeout: 10_000,
    });
    vncWs.binaryType = "arraybuffer";

    vncWs.on("open", () => {
      if (disposed) {
        vncWs?.close();
        return;
      }
      // eslint-disable-next-line no-console
      console.log(`vnc tunnel: vncWs connected to ${vncWsUrl}, opening gateway ws to ${tunnelUrl}`);

      // Now open WebSocket to gateway tunnel endpoint
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
        let vncBytes = 0;
        let gwBytes = 0;

        // Bridge: VNC server → Gateway (browser)
        vncWs!.on("message", (data) => {
          const buf = data instanceof Buffer ? data : Buffer.from(data as ArrayBuffer);
          vncBytes += buf.length;
          if (vncBytes <= buf.length) {
            // eslint-disable-next-line no-console
            console.log(`vnc tunnel: first vnc→gw data: ${buf.length} bytes (first 20: ${buf.subarray(0, 20).toString("utf8").replace(/[^\x20-\x7E]/g, ".")})`);
          }
          if (!disposed && gatewayWs?.readyState === WebSocket.OPEN) {
            gatewayWs.send(buf, (err) => {
              if (err && !disposed) {
                // eslint-disable-next-line no-console
                console.warn(`vnc tunnel: gw send error: ${err.message}`);
              }
            });
          }
        });

        // Bridge: Gateway (browser) → VNC server
        gatewayWs!.on("message", (data) => {
          const buf = data instanceof Buffer ? data : Buffer.from(data as ArrayBuffer);
          gwBytes += buf.length;
          if (gwBytes <= buf.length) {
            // eslint-disable-next-line no-console
            console.log(`vnc tunnel: first gw→vnc data: ${buf.length} bytes`);
          }
          if (!disposed && vncWs?.readyState === WebSocket.OPEN) {
            vncWs.send(buf, (err) => {
              if (err && !disposed) {
                // eslint-disable-next-line no-console
                console.warn(`vnc tunnel: vnc send error: ${err.message}`);
              }
            });
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

    vncWs.on("error", (err) => {
      if (!disposed) {
        // eslint-disable-next-line no-console
        console.warn(`vnc tunnel: vncWs error: ${err.message}`);
        cleanup();
      }
      resolve(cleanup);
    });

    vncWs.on("close", (code, reason) => {
      // eslint-disable-next-line no-console
      console.log(`vnc tunnel: vncWs close (code=${code} reason=${reason?.toString()})`);
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

    vncWs.once("open", () => clearTimeout(timeout));
  });
}
