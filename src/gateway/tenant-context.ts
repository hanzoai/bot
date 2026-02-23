/**
 * Tenant context resolution and validation for multi-tenant gateway.
 *
 * Maps IAM user claims + connect params to a TenantContext that scopes
 * sessions, canvas, and billing to a specific org/project.
 */

import type { GatewayIamAuthResult } from "./auth-iam.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TenantContext = {
  /** Organization ID (required for tenant mode). */
  orgId: string;
  /** Project ID within the org (optional). */
  projectId?: string;
  /** User ID (from JWT sub claim). */
  userId: string;
  /** User display name or email. */
  userName?: string;
  /** Environment tag (e.g. "production", "staging"). */
  env?: string;
};

// ---------------------------------------------------------------------------
// Tenant resolution
// ---------------------------------------------------------------------------

/**
 * Resolve tenant context from IAM auth result + connect params.
 *
 * Priority for orgId:
 *   1. Explicit `tenant.orgId` from connect params
 *   2. IAM auth result's `currentOrgId`
 *   3. First org in IAM auth result's `orgIds`
 *
 * Returns null if no org can be determined (personal/self-hosted mode).
 */
export function resolveTenantContext(params: {
  iamResult: GatewayIamAuthResult & { ok: true };
  requestedTenant?: {
    orgId?: string;
    projectId?: string;
    env?: string;
  };
}): TenantContext | null {
  const { iamResult, requestedTenant } = params;

  const orgId = requestedTenant?.orgId ?? iamResult.currentOrgId ?? iamResult.orgIds[0];

  if (!orgId) {
    return null;
  }

  return {
    orgId,
    projectId: requestedTenant?.projectId,
    userId: iamResult.userId,
    userName: iamResult.name ?? iamResult.email,
    env: requestedTenant?.env,
  };
}

// ---------------------------------------------------------------------------
// Tenant access validation
// ---------------------------------------------------------------------------

/**
 * Validate that the user has access to the requested tenant (org/project).
 * Returns an error reason if access is denied, or null if allowed.
 */
export function validateTenantAccess(params: {
  iamResult: GatewayIamAuthResult & { ok: true };
  tenant: TenantContext;
}): string | null {
  const { iamResult, tenant } = params;

  // Check the user belongs to the requested org
  if (!iamResult.orgIds.includes(tenant.orgId)) {
    return "tenant_org_not_member";
  }

  // Project-level access could be validated here in the future
  // (e.g. checking project memberships from IAM)

  return null;
}
