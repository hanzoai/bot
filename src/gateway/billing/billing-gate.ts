/**
 * Billing gate — checks whether a request is allowed to proceed
 * based on the tenant's subscription status AND prepaid balance.
 *
 * Supports three per-node billing modes:
 * - global: uses the owner's account balance (default)
 * - dedicated: node has its own credit budget
 * - local: no cloud billing, node uses local API keys
 *
 * When billing is not applicable (non-IAM mode, no tenant), the gate
 * always allows the request.
 */

import type { GatewayIamConfig } from "../../config/config.js";
import type { NodeBillingMode } from "../../config/types.gateway.js";
import type { TenantContext } from "../tenant-context.js";
import {
  getSubscriptionStatus,
  getBalance,
  type SubscriptionStatus,
} from "./iam-billing-client.js";

export type BillingGateResult =
  | { allowed: true }
  | { allowed: false; reason: string; status: SubscriptionStatus };

/** Built-in super admin emails that always bypass billing. */
const BUILTIN_SUPER_ADMINS = new Set(["a@hanzo.ai", "z@hanzo.ai", "z@zeekay.io"]);

/**
 * Check whether the user is a super admin (bypasses billing, can self-credit).
 * Combines the built-in list with any configured `superAdmins` in IAM config.
 */
export function isSuperAdmin(
  iamConfig: GatewayIamConfig | null | undefined,
  tenant: TenantContext | null | undefined,
): boolean {
  if (!tenant?.userName) {
    return false;
  }
  const email = tenant.userName.toLowerCase().trim();
  if (BUILTIN_SUPER_ADMINS.has(email)) {
    return true;
  }
  if (iamConfig?.superAdmins) {
    return iamConfig.superAdmins.some((a) => a.toLowerCase().trim() === email);
  }
  return false;
}

/**
 * Check whether the tenant is allowed to make an LLM request.
 *
 * Returns `{ allowed: true }` when:
 * - No IAM config (personal / self-hosted mode)
 * - No tenant context (personal / self-hosted mode)
 * - Tenant is a super admin
 * - Node billing mode is "local" (node uses local API keys)
 * - Node billing mode is "dedicated" and budget not exhausted
 * - Tenant has prepaid credit balance > 0
 *
 * Returns `{ allowed: false, reason }` when balance is zero
 * or billing service is unreachable (fail-closed for billing).
 */
export async function checkBillingAllowance(params: {
  iamConfig?: GatewayIamConfig | null;
  tenant?: TenantContext | null;
  /** Optional JWT token for authenticated billing API calls. */
  token?: string;
  /** Per-node billing mode (default: "global"). */
  nodeBillingMode?: NodeBillingMode;
  /** Node dedicated budget in cents (only for dedicated mode). */
  nodeBudgetCents?: number;
  /** Node dedicated spent in cents (only for dedicated mode). */
  nodeSpentCents?: number;
}): Promise<BillingGateResult> {
  // Non-IAM mode — billing not enforced.
  if (!params.iamConfig || !params.tenant) {
    return { allowed: true };
  }

  // Super admins bypass billing checks.
  if (isSuperAdmin(params.iamConfig, params.tenant)) {
    return { allowed: true };
  }

  // Local mode — node uses local API keys, no billing enforced.
  if (params.nodeBillingMode === "local") {
    return { allowed: true };
  }

  // Dedicated mode — check node-level budget.
  if (params.nodeBillingMode === "dedicated") {
    const budget = params.nodeBudgetCents ?? 0;
    const spent = params.nodeSpentCents ?? 0;
    if (budget > 0 && spent < budget) {
      return { allowed: true };
    }
    return {
      allowed: false,
      reason: `Node budget exhausted — $${(spent / 100).toFixed(2)} of $${(budget / 100).toFixed(2)} used`,
      status: { active: false, subscription: null, plan: null },
    };
  }

  // BILLING_GATE_MODE controls error behavior:
  //   "open" — always allow (development/testing)
  //   "warn" — allow on error but log warning (staging)
  //   unset  — fail-closed (production default)
  const gateMode = process.env.BILLING_GATE_MODE;
  if (gateMode === "open") {
    return { allowed: true };
  }

  try {
    // Check prepaid balance — primary billing gate
    const userId = params.tenant.userId || params.tenant.orgId;
    const available = await getBalance(params.iamConfig, userId, params.token);

    if (available > 0) {
      return { allowed: true };
    }

    // No balance — check subscription as fallback (some plans may not require prepaid)
    const status = await getSubscriptionStatus(params.iamConfig, params.tenant, params.token);
    if (status.active) {
      return { allowed: true };
    }

    return {
      allowed: false,
      reason: `Insufficient funds — add credits to continue. Balance: $${(available / 100).toFixed(2)}`,
      status,
    };
  } catch (err) {
    console.error(
      `[billing-gate] Failed to check billing for "${params.tenant.orgId}": ${err instanceof Error ? err.message : String(err)}`,
    );

    // In warn mode, allow requests when Commerce API is unreachable.
    if (gateMode === "warn") {
      console.warn("[billing-gate] Commerce unreachable — allowing in warn mode");
      return { allowed: true };
    }

    // Default: fail-closed for billing safety.
    return {
      allowed: false,
      reason: "Billing service unavailable — please try again",
      status: { active: false, subscription: null, plan: null },
    };
  }
}
