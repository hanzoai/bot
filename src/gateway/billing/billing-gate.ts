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
import { getTier, getWalletBalance } from "./iam-billing-client.js";

export type BillingRefusalCode = "payment_required" | "model_not_in_plan" | "billing_unavailable";

export type BillingGateResult =
  | { allowed: true; tier?: PlanTier }
  | { allowed: false; reason: string; code: BillingRefusalCode; model?: string };

/** Whether a plan's model list names the model, with or without the provider prefix. */
function modelAllowed(allowed: string[], model: string): boolean {
  const bare = model.slice(model.lastIndexOf("/") + 1);
  return allowed.some((m) => m === "*" || m === model || m === bare);
}

/** Map a Commerce plan slug to a PlanTier for model routing. */
function resolvePlanTier(slug: string | null | undefined): PlanTier {
  if (!slug) {
    return "developer";
  }
  const lower = slug.toLowerCase();
  if (lower.includes("enterprise")) {
    return "enterprise";
  }
  if (lower.includes("team")) {
    return "team";
  }
  if (lower.includes("pro")) {
    return "pro";
  }
  return "developer";
}

/** SuperAdmin is the reserved `admin` org: the token's owner, which IAM signs, and nothing a user can name. */
export function isSuperAdmin(tenant: TenantContext | null | undefined): boolean {
  return tenant?.owner === "admin";
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
  /** Bot/agent ID for wallet balance check. */
  botId?: string;
  /** The model the request will run, which the caller's plan must allow. */
  model?: string;
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
          code: "payment_required",
        };
      }
    } catch {
      // Wallet check failed — don't gate (fail-open)
    }
  }

  // Super admins bypass billing checks — enterprise tier.
  if (isSuperAdmin(params.tenant)) {
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
      code: "payment_required",
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
    if (!params.token) {
      throw new Error("no bearer token to bill");
    }
    const plan = await getTier(params.token);
    const available = plan.balance.effectiveAvailable;
    if (available <= 0) {
      return {
        allowed: false,
        reason: `Insufficient funds — add credits or upgrade your plan to continue. Balance: $${(available / 100).toFixed(2)}`,
        code: "payment_required",
      };
    }
    if (params.model && !modelAllowed(plan.tier.allowedModels, params.model)) {
      return {
        allowed: false,
        reason: `${params.model} is not in your ${plan.tier.name} plan — upgrade to use it`,
        code: "model_not_in_plan",
        model: params.model,
      };
    }
    return { allowed: true, tier: resolvePlanTier(plan.tier.name) };
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
      code: "billing_unavailable",
    };
  }
}
