import crypto from "node:crypto";
import { ErrorCodes, errorShape } from "../protocol/index.js";
import type { GatewayRequestHandlers } from "./types.js";

const VNC_HMAC_SECRET =
  process.env.BOT_VNC_HMAC_SECRET || crypto.randomBytes(32).toString("hex");
const VNC_TOKEN_TTL_MS = 3_600_000; // 1 hour

export function generateVncToken(nodeId: string): string {
  const payload = JSON.stringify({ nodeId, exp: Date.now() + VNC_TOKEN_TTL_MS });
  const hmac = crypto
    .createHmac("sha256", VNC_HMAC_SECRET)
    .update(payload)
    .digest("hex");
  return Buffer.from(`${payload}.${hmac}`).toString("base64url");
}

export function verifyVncToken(token: string): { nodeId: string } | null {
  try {
    const decoded = Buffer.from(token, "base64url").toString();
    const dotIdx = decoded.lastIndexOf(".");
    if (dotIdx < 0) {
      return null;
    }
    const payload = decoded.slice(0, dotIdx);
    const hmac = decoded.slice(dotIdx + 1);
    const expected = crypto
      .createHmac("sha256", VNC_HMAC_SECRET)
      .update(payload)
      .digest("hex");
    if (!crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(expected))) {
      return null;
    }
    const data = JSON.parse(payload) as { nodeId: string; exp: number };
    if (Date.now() > data.exp) {
      return null;
    }
    return { nodeId: data.nodeId };
  } catch {
    return null;
  }
}

export function renderVncViewer(wsUrl: string, password?: string): string {
  const nonce = crypto.randomBytes(16).toString("base64");
  const credentialsArg = password
    ? `, { credentials: { password: "${password}" } }`
    : "";
  return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<title>Hanzo Bot - Screen</title>
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'nonce-${nonce}' https://esm.sh; connect-src 'self' wss: ws:; style-src 'nonce-${nonce}'; img-src 'self' data:;">
<style nonce="${nonce}">
  body { margin: 0; background: #000; overflow: hidden; }
  #screen { width: 100vw; height: 100vh; }
</style>
</head><body>
<div id="screen"></div>
<script type="module" nonce="${nonce}">
import RFB from "https://esm.sh/@novnc/novnc/core/rfb.js";
const rfb = new RFB(document.getElementById("screen"), "${wsUrl}"${credentialsArg});
rfb.scaleViewport = true;
rfb.resizeSession = true;
</script>
</body></html>`;
}

export const vncHandlers: GatewayRequestHandlers = {
  "vnc.token": async ({ params, respond, context }) => {
    const nodeId = typeof params.nodeId === "string" ? params.nodeId.trim() : "";
    if (!nodeId) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "nodeId is required"),
      );
      return;
    }

    const node = context.nodeRegistry.listConnected().find((n) => n.nodeId === nodeId);
    if (!node) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `node not found: ${nodeId}`),
      );
      return;
    }

    const token = generateVncToken(nodeId);
    respond(true, { token, expiresInMs: VNC_TOKEN_TTL_MS });
  },
};
