/**
 * vnc-tickets.ts — who may watch which screen, and the ticket that says so.
 *
 * A screen is the whole machine: an RFB stream carries the pixels OUT and the
 * keyboard and mouse IN. So /vnc opens only with a ticket, minted over an
 * authenticated gateway connection by `vnc.ticket`, and the ticket names the one
 * screen it opens:
 *
 *   - a NODE's screen, to a viewer whose org OWNS that node — the node signed in
 *     with a hanzo.id token whose `owner` is the viewer's `owner`. A node with no
 *     owner (one that connected with the shared gateway token) belongs to no
 *     tenant, and no tenant may watch it.
 *   - the GATEWAY's own screen (no node), to a SuperAdmin only — `owner` is the
 *     reserved org "admin" — because the machine under the gateway is the
 *     platform's, not any tenant's.
 *
 * On a gateway that is not multi-tenant (auth mode other than "iam") there is one
 * owner, the operator the gateway authenticated, and a connection without an IAM
 * identity may watch any screen. On an IAM gateway a connection without one — the
 * shared token included — may watch none.
 *
 * A ticket is a browser's credential, because a browser cannot put a header on a
 * WebSocket upgrade: HMAC-signed with a key this process made and never wrote
 * down, good for TICKET_TTL_MS, spent on first use. The upgrade re-checks
 * ownership, since a node can reconnect under another identity between the mint
 * and the open.
 */

import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { NodeRegistry, NodeSession } from "./node-registry.js";
import type { GatewayClient } from "./server-methods/types.js";

/** The reserved org whose owner is a SuperAdmin (the one predicate, everywhere). */
export const SUPERADMIN_ORG = "admin";
export const TICKET_TTL_MS = 60_000;

/** What a ticket opens. `org` is empty for the single owner of a non-IAM gateway. */
export type VncTarget = { org: string; nodeId: string | null };

type Claims = VncTarget & { exp: number; jti: string };

const key = randomBytes(32);
/** Tickets spent, until they would have expired anyway. */
const spent = new Map<string, number>();

function sign(body: string): Buffer {
  return createHmac("sha256", key).update(body).digest();
}

function prune(now: number) {
  for (const [jti, exp] of spent) {
    if (exp <= now) {
      spent.delete(jti);
    }
  }
}

export function mintVncTicket(target: VncTarget, now = Date.now()): string {
  const claims: Claims = { ...target, exp: now + TICKET_TTL_MS, jti: randomUUID() };
  const body = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${body}.${sign(body).toString("base64url")}`;
}

/**
 * redeemVncTicket answers what a ticket opens and spends it, or null for a ticket
 * that is forged, expired or already used.
 */
export function redeemVncTicket(ticket: string, now = Date.now()): VncTarget | null {
  const dot = ticket.indexOf(".");
  if (dot <= 0) {
    return null;
  }
  const body = ticket.slice(0, dot);
  const mac = Buffer.from(ticket.slice(dot + 1), "base64url");
  const want = sign(body);
  if (mac.length !== want.length || !timingSafeEqual(mac, want)) {
    return null;
  }
  let claims: Claims;
  try {
    claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Claims;
  } catch {
    return null;
  }
  prune(now);
  if (typeof claims.exp !== "number" || claims.exp <= now || spent.has(claims.jti)) {
    return null;
  }
  spent.set(claims.jti, claims.exp);
  return { org: claims.org, nodeId: claims.nodeId };
}

/** The org that owns a node: its IAM owner, or null for a node no tenant owns. */
export function nodeOwner(node: NodeSession): string | null {
  return node.client.identity?.owner ?? null;
}

export type VncDecision =
  | { ok: true; target: VncTarget }
  | { ok: false; code: 401 | 403 | 404; message: string };

/**
 * mayWatch decides whether a gateway connection may open a screen. `multiTenant`
 * is whether the gateway authenticates with IAM. A node the viewer does not own
 * answers exactly as a node that does not exist, so the answer names no one's.
 */
export function mayWatch(params: {
  client: Pick<GatewayClient, "identity"> | null;
  nodeId: string | null;
  registry: Pick<NodeRegistry, "get">;
  multiTenant: boolean;
}): VncDecision {
  const { client, nodeId, registry, multiTenant } = params;
  const identity = client?.identity;
  const owner = identity?.method === "iam" ? (identity.owner ?? null) : null;
  if (multiTenant && !owner) {
    return { ok: false, code: 401, message: "watching a screen needs a hanzo.id session" };
  }
  const node = nodeId ? registry.get(nodeId) : undefined;
  if (nodeId && !node) {
    return { ok: false, code: 404, message: "no such node for this org" };
  }
  if (!owner) {
    // A non-IAM gateway has one owner, and this connection authenticated as it.
    return { ok: true, target: { org: "", nodeId } };
  }
  if (!nodeId) {
    return owner === SUPERADMIN_ORG
      ? { ok: true, target: { org: owner, nodeId: null } }
      : { ok: false, code: 403, message: "the gateway's own screen is not a tenant's" };
  }
  if (nodeOwner(node!) !== owner) {
    return { ok: false, code: 404, message: "no such node for this org" };
  }
  return { ok: true, target: { org: owner, nodeId } };
}

/**
 * stillMay re-decides a redeemed ticket at the upgrade: the node must still be
 * connected and still be the ticket org's, and a ticket minted for a non-IAM
 * gateway's owner opens nothing on a multi-tenant one.
 */
export function stillMay(
  target: VncTarget,
  registry: Pick<NodeRegistry, "get"> | null | undefined,
  multiTenant: boolean,
): boolean {
  if (!target.org) {
    if (multiTenant) {
      return false;
    }
    return target.nodeId === null || Boolean(registry?.get(target.nodeId));
  }
  if (target.nodeId === null) {
    return target.org === SUPERADMIN_ORG;
  }
  const node = registry?.get(target.nodeId);
  return Boolean(node) && nodeOwner(node!) === target.org;
}
