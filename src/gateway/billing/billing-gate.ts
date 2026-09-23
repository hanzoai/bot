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

import type { PlanTier } from "../../commerce/tier-model.js";
import type { GatewayIamConfig } from "../../config/config.js";
import type { NodeBillingMode } from "../../config/types.gateway.js";
import type { TenantContext } from "../tenant-context.js";
import {
  getSubscriptionStatus,
  getBalance,
  getWalletBalance,
  OrgNotGrantedError,
  type SubscriptionStatus,
} from "./iam-billing-client.js";

export type BillingGateResult =
  | { allowed: true; tier?: PlanTier }
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
 * Returns `{ allowed: false, reason }` when balance is zero and no
 * subscription is active, when the gateway is not granted the tenant's org
 * (in every mode that checks), or when the billing service is unreachable
 * (fail-closed unless BILLING_GATE_MODE=warn).
 */
export async function checkBillingAllowance(params: {
  iamConfig?: GatewayIamConfig | null;
  tenant?: TenantContext | null;
  /**
   * The signed-in user's own IAM bearer, forwarded for caller-scoped reads.
   * Without it the gateway reads as its IAM application for the tenant's org.
   */
  token?: string;
  /** Per-node billing mode (default: "global"). */
  nodeBillingMode?: NodeBillingMode;
  /** Node dedicated budget in cents (only for dedicated mode). */
  nodeBudgetCents?: number;
  /** Node dedicated spent in cents (only for dedicated mode). */
  nodeSpentCents?: number;
  /** Bot/agent ID for wallet balance check. */
  botId?: string;
}): Promise<BillingGateResult> {
  // Non-IAM mode — billing not enforced.
  if (!params.iamConfig || !params.tenant) {
    return { allowed: true };
  }

  // Bot wallet check — if the bot has an enabled wallet, enforce it.
  // This runs BEFORE super-admin bypass so wallet is always the source of truth.
  if (params.botId) {
    try {
      const walletBalance = await getWalletBalance(params.botId);
      // walletBalance === -1 means wallet doesn't exist or is disabled → skip check
      if (walletBalance == 0) {
        return {
          allowed: false,
          reason: "Bot wallet has insufficient funds. Fund your bot wallet to continue.",
          status: { active: false, subscription: null, plan: null },
        };
      }
    } catch {
      // Wallet check failed — don't gate (fail-open)
    }
  }

  // Super admins bypass billing checks — enterprise tier.
  if (isSuperAdmin(params.iamConfig, params.tenant)) {
    return { allowed: true, tier: "enterprise" as PlanTier };
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
    // Prepaid balance is the primary gate.
    const available = await getBalance(params.iamConfig, params.tenant.orgId, params.token);
    if (available > 0) {
      return { allowed: true };
    }

    // No balance: an active subscription still admits (some plans are not prepaid).
    const status = await getSubscriptionStatus(params.iamConfig, params.tenant, params.token);
    if (status.active) {
      return { allowed: true };
    }

    return {
      allowed: false,
      reason: `Insufficient funds — add credits or upgrade your plan to continue. Balance: $${(available / 100).toFixed(2)}`,
      status,
    };
  } catch (err) {
    // Not granted the org is an answer, not an outage: refused in warn mode too.
    if (err instanceof OrgNotGrantedError) {
      console.error(`[billing-gate] ${err.message}`);
      return {
        allowed: false,
        reason: "Billing is not authorized for this organization",
        status: { active: false, subscription: null, plan: null },
      };
    }

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
