import type { WebSocket } from "ws";
import type { GatewayIamAuthResult } from "../auth-iam.js";
import type { ConnectParams } from "../protocol/index.js";
import type { TenantContext } from "../tenant-context.js";

export type GatewayWsClient = {
  socket: WebSocket;
  connect: ConnectParams;
  connId: string;
  presenceKey?: string;
  clientIp?: string;
  /** Resolved tenant context (multi-tenant IAM mode). */
  tenant?: TenantContext;
  /** IAM auth result (when auth mode is "iam"). */
  iamResult?: GatewayIamAuthResult & { ok: true };
  canvasHostUrl?: string;
  /**
   * Canvas capability token issued to this client.
   * Only node-role clients may hold a canvas capability.
   */
  canvasCapability?: string;
  /**
   * Expiry timestamp (ms since epoch) for the canvas capability.
   * Requests arriving after this time are rejected.
   */
  canvasCapabilityExpiresAtMs?: number;
};
