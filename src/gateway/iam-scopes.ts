/**
 * Canonical IAM SuperAdmin predicate and IAM-derived operator scope mapping.
 *
 * Kept free of `@hanzo/iam` imports so gateway auth and plugin-sdk DTS builds
 * can import it statically without pulling in SDK types.
 */

import { roleScopesAllow } from "../shared/operator-scope-compat.js";
import {
  APPROVALS_SCOPE,
  CLI_DEFAULT_OPERATOR_SCOPES,
  PAIRING_SCOPE,
  READ_SCOPE,
  WRITE_SCOPE,
  type OperatorScope,
} from "./method-scopes.js";

/**
 * Canonical SuperAdmin predicate: SuperAdmin iff the verified IAM home org
 * (`owner`, resolved from signed `orgs[0]` for people or `owner` for
 * `type === "application"` tokens) is the reserved `"admin"` org.
 * Org-level `isAdmin` / `"admin"` role is NOT SuperAdmin.
 */
export function isIamSuperAdmin(iam: { owner?: string } | null | undefined): boolean {
  return iam?.owner === "admin";
}

/**
 * Derive the maximum operator scopes granted to an IAM-authenticated principal
 * strictly from verified JWT claims (`owner` + signed `roles`).
 *
 * Never trusts client-declared `connectParams.scopes` and never promotes a
 * non-SuperAdmin org admin to `operator.admin`.
 */
export function deriveIamOperatorScopes(
  iam: { owner?: string; roles?: readonly string[] } | null | undefined,
): OperatorScope[] {
  if (!iam) {
    return [];
  }
  if (isIamSuperAdmin(iam)) {
    return [...CLI_DEFAULT_OPERATOR_SCOPES];
  }
  const scopes = new Set<OperatorScope>([READ_SCOPE, WRITE_SCOPE]);
  for (const rawRole of iam.roles ?? []) {
    const role = rawRole.trim().toLowerCase();
    if (role === APPROVALS_SCOPE || role === "approvals") {
      scopes.add(APPROVALS_SCOPE);
    } else if (role === PAIRING_SCOPE || role === "pairing") {
      scopes.add(PAIRING_SCOPE);
    }
  }
  return [...scopes];
}

/**
 * Bound client-requested operator scopes against the scopes actually derived
 * from verified IAM claims. Any requested scope not granted by IAM is dropped.
 */
export function resolveIamBoundedScopes(params: {
  requestedScopes: readonly string[];
  iam: { owner?: string; roles?: readonly string[] } | null | undefined;
}): string[] {
  const requested = params.requestedScopes.map((s) => s.trim()).filter(Boolean);
  if (requested.length === 0) {
    return [];
  }
  const granted = deriveIamOperatorScopes(params.iam);
  return requested.filter((scope) =>
    roleScopesAllow({
      role: "operator",
      requestedScopes: [scope],
      allowedScopes: granted,
    }),
  );
}
