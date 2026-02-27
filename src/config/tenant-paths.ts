/**
 * Tenant-scoped path resolution.
 *
 * When a tenant context is present (multi-tenant/IAM mode), all mutable state
 * is scoped under: ~/.bot/tenants/{orgId}/{projectId}/
 *
 * When no tenant context (personal/self-hosted mode), paths fall back to the
 * default flat layout: ~/.bot/
 */

import path from "node:path";
import type { TenantContext } from "../gateway/tenant-context.js";
import { resolveStateDir } from "./paths.js";

// Safe character pattern for path segments
const SAFE_SLUG_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;

function sanitizeSlug(value: string): string {
  if (SAFE_SLUG_RE.test(value)) {
    return value;
  }
  // Fall back to URL-safe encoding
  return encodeURIComponent(value).replace(/%/g, "_");
}

/**
 * Resolve the root state directory for a tenant.
 *
 * With tenant:    ~/.bot/tenants/{orgId}/{projectId}/
 * Without tenant: ~/.bot/
 */
export function resolveTenantStateDir(
  tenant?: TenantContext | null,
  env?: NodeJS.ProcessEnv,
): string {
  const baseDir = resolveStateDir(env);

  if (!tenant) {
    return baseDir;
  }

  const orgSlug = sanitizeSlug(tenant.orgId);
  if (tenant.projectId) {
    const projectSlug = sanitizeSlug(tenant.projectId);
    return path.join(baseDir, "tenants", orgSlug, projectSlug);
  }
  return path.join(baseDir, "tenants", orgSlug);
}

/**
 * Resolve the canvas root directory for a tenant.
 *
 * With tenant:    ~/.bot/tenants/{orgId}/{projectId}/canvas/
 * Without tenant: ~/.bot/canvas/
 */
export function resolveTenantCanvasRoot(
  tenant?: TenantContext | null,
  env?: NodeJS.ProcessEnv,
): string {
  return path.join(resolveTenantStateDir(tenant, env), "canvas");
}

/**
 * Resolve the sessions directory for a tenant + agent.
 *
 * With tenant:    ~/.bot/tenants/{orgId}/{projectId}/agents/{agentId}/sessions/
 * Without tenant: ~/.bot/agents/{agentId}/sessions/
 */
export function resolveTenantSessionsDir(
  tenant?: TenantContext | null,
  agentId?: string,
  env?: NodeJS.ProcessEnv,
): string {
  const baseDir = resolveTenantStateDir(tenant, env);
  const id = agentId ?? "default";
  return path.join(baseDir, "agents", id, "sessions");
}

/**
 * Resolve the session store file (sessions.json) for a tenant + agent.
 */
export function resolveTenantSessionStorePath(
  tenant?: TenantContext | null,
  agentId?: string,
  env?: NodeJS.ProcessEnv,
): string {
  return path.join(resolveTenantSessionsDir(tenant, agentId, env), "sessions.json");
}
