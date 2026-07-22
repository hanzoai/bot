import type { WebSocket } from "ws";
import type { ConnectParams } from "../protocol/index.js";

/**
 * Viewer identity captured at the IAM handshake. Present only when the
 * connection authenticated via IAM (method "iam") and its JWT resolved an org.
 * Drives the per-viewer, per-org cloud read-through in `agents.list`.
 */
export type GatewayClientIdentity = {
  orgId: string;
  bearer: string;
  method: "iam";
};

export type GatewayWsClient = {
  socket: WebSocket;
  connect: ConnectParams;
  connId: string;
  presenceKey?: string;
  clientIp?: string;
  canvasHostUrl?: string;
  canvasCapability?: string;
  canvasCapabilityExpiresAtMs?: number;
  identity?: GatewayClientIdentity;
};
