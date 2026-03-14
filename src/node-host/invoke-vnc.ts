/**
 * VNC Tunnel - Node Host Side
 *
 * When the gateway sends a `vnc.tunnel.open` invoke, the node-host:
 * 1. Connects to x11vnc via raw TCP (default: 127.0.0.1:5900)
 * 2. Sends the RFB client version to break LibVNCServer's MSG_PEEK deadlock
 * 3. Opens a WebSocket to the gateway's /vnc-tunnel endpoint
 * 4. Bridges VNC data between TCP and WebSocket, intercepting the protocol
 *    to drop the duplicate version string the browser will send
 *
 * Why raw TCP with protocol interception?
 * - x11vnc (LibVNCServer 0.9.13) blocks on recv(MSG_PEEK) on new connections
 *   to detect WebSocket vs RFB. Since RFB requires the server to speak first,
 *   this creates a deadlock where both sides wait indefinitely.
 * - websockify on port 6080 also deadlocks because it opens a clean TCP
 *   connection to x11vnc:5900 without sending initial data.
 * - x11vnc's built-in WebSocket is too basic for the `ws` npm library.
 * - FIX: We send "RFB 003.008\n" immediately after TCP connect. x11vnc's
 *   MSG_PEEK sees "R" (not "G" for "GET"), enters RFB mode, consumes our
 *   version as the client version, and sends its server version + security
 *   types. We then relay x11vnc's data to the browser (noVNC), but DROP
 *   the first 12 bytes the browser sends back (noVNC's version response)
 *   since x11vnc already consumed one.
 */

import { createConnection, type Socket } from "node:net";
import { WebSocket } from "ws";

const DEFAULT_VNC_HOST = process.env.BOT_VNC_HOST?.trim() ?? "127.0.0.1";
const DEFAULT_VNC_PORT = Number(process.env.BOT_VNC_PORT?.trim() ?? 5900);

/**
 * RFB version string: exactly 12 bytes.
 * Sent to x11vnc to break the LibVNCServer MSG_PEEK deadlock.
 */
const RFB_CLIENT_VERSION = Buffer.from("RFB 003.008\n");

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
 * Open a VNC tunnel: connect to local x11vnc via TCP (with deadlock fix)
 * and bridge to gateway tunnel WS.
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

    // Connect to x11vnc via raw TCP
    vncTcp = createConnection({ host: vncHost, port: vncPort }, () => {
      if (disposed) {
        vncTcp?.destroy();
        return;
      }
      // eslint-disable-next-line no-console
      console.log(`vnc tunnel: TCP connected to ${vncHost}:${vncPort}, sending RFB version to break deadlock`);

      let vncBytes = 0;
      let gwBytes = 0;

      // Buffer for data from x11vnc that arrives before the gateway WS opens.
      // x11vnc responds on localhost in microseconds after receiving the RFB
      // version, but the gateway WS handshake goes over the network and takes
      // much longer. Without buffering, the initial server response is lost.
      const pendingVncData: Buffer[] = [];
      let wsReady = false;

      // Number of bytes to drop from browser→vnc direction.
      // noVNC will send its own version string (12 bytes) after receiving
      // the server's version, but x11vnc already consumed our injected one.
      // We must drop the browser's version to keep the protocol in sync.
      let browserBytesToDrop = RFB_CLIENT_VERSION.length;

      // Register TCP data handler IMMEDIATELY — before sending the RFB version
      // and before the gateway WS handshake. This ensures we capture x11vnc's
      // response even if it arrives before the WS is open.
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

      // Send RFB client version to break LibVNCServer's MSG_PEEK deadlock.
      // x11vnc will see "R" (not "G" for "GET"), enter RFB mode, consume
      // this as the client's version string, then send the server version.
      vncTcp!.write(RFB_CLIENT_VERSION);

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
        wsReady = true;

        // Flush any data buffered from x11vnc while WS was connecting
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

          // Drop the first 12 bytes (noVNC's version response) since x11vnc
          // already consumed our injected version string.
          if (browserBytesToDrop > 0) {
            const skip = Math.min(browserBytesToDrop, buf.length);
            browserBytesToDrop -= skip;
            if (gwBytes <= buf.length) {
              // eslint-disable-next-line no-console
              console.log(`vnc tunnel: dropping ${skip} bytes of browser version response (remaining to drop: ${browserBytesToDrop})`);
            }
            const remaining = buf.subarray(skip);
            if (remaining.length > 0 && !disposed && vncTcp && !vncTcp.destroyed) {
              vncTcp.write(remaining);
            }
            return;
          }

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
