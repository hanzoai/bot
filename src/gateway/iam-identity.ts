// IAM identity extraction — pure-trust pattern.
//
// hanzoai/gateway sits in front of the bot in cloud deployments. It
// validates the IAM JWT, strips any client-supplied X-Org-Id /
// X-User-Id / X-User-Email headers, then re-attaches the canonical
// values from the verified JWT claims (owner / sub / email).
//
// This module reads those headers and surfaces them as a typed
// identity object. The bot does NOT validate the JWT itself — that's
// the gateway's job — and does NOT reach back to IAM. Trust is
// upstream. If this code path is reached without a gateway in front,
// every request looks anonymous (all fields null) and downstream code
// degrades to the legacy single-tenant path.
//
// Vendor-free X-* convention per ~/work/hanzo/CLAUDE.md (2026-03-27).

import type { IncomingMessage } from "node:http";

export interface IamIdentity {
  /** Org slug from JWT `owner` claim (set by gateway). null if absent. */
  orgId: string | null;
  /** User ID from JWT `sub` claim (set by gateway). null if absent. */
  userId: string | null;
  /** Email from JWT `email` claim (set by gateway). null if absent. */
  userEmail: string | null;
  /** True iff at least one identity header was present. */
  authenticated: boolean;
}

const ORG_HEADER = "x-org-id";
const USER_HEADER = "x-user-id";
const EMAIL_HEADER = "x-user-email";

function readHeader(req: IncomingMessage, name: string): string | null {
  const raw = req.headers[name];
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (Array.isArray(raw) && raw.length > 0) {
    const trimmed = String(raw[0]).trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return null;
}

/**
 * Extract IAM identity headers set by hanzoai/gateway upstream.
 *
 * Returns an identity object even when no headers are present — the
 * caller decides whether to reject (multitenant cloud) or continue
 * (single-tenant solo).
 */
export function extractIamIdentity(req: IncomingMessage): IamIdentity {
  const orgId = readHeader(req, ORG_HEADER);
  const userId = readHeader(req, USER_HEADER);
  const userEmail = readHeader(req, EMAIL_HEADER);
  return {
    orgId,
    userId,
    userEmail,
    authenticated: Boolean(orgId || userId || userEmail),
  };
}

/**
 * Cross-realm Symbol used as the IncomingMessage property key for the
 * extracted identity. Symbol.for() so independently-loaded copies of
 * this module agree on the same key.
 */
const IAM_IDENTITY_KEY = Symbol.for("hanzo.bot.iamIdentity");

interface IamIdentityCarrier {
  [IAM_IDENTITY_KEY]?: IamIdentity;
}

/**
 * Attach the extracted identity to the request object once per request
 * so downstream handlers can read it without re-parsing headers.
 * Idempotent — safe to call multiple times.
 */
export function attachIamIdentity(req: IncomingMessage): IamIdentity {
  const carrier = req as unknown as IamIdentityCarrier;
  const cached = carrier[IAM_IDENTITY_KEY];
  if (cached) {
    return cached;
  }
  const id = extractIamIdentity(req);
  carrier[IAM_IDENTITY_KEY] = id;
  return id;
}

/**
 * Read the previously-attached identity. Falls back to extracting it
 * if attachIamIdentity wasn't called for this request.
 */
export function getIamIdentity(req: IncomingMessage): IamIdentity {
  const carrier = req as unknown as IamIdentityCarrier;
  return carrier[IAM_IDENTITY_KEY] ?? attachIamIdentity(req);
}
