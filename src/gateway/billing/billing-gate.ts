/**
 * Billing gate — checks whether a request is allowed to proceed
 * based on the tenant's subscription status.
 *
 * When billing is not applicable (non-IAM mode, no tenant), the gate
 * always allows the request.
 */

import type { GatewayIamConfig } from "../../config/config.js";
import type { TenantContext } from "../tenant-context.js";
import { getSubscriptionStatus, type SubscriptionStatus } from "./iam-billing-client.js";

export type BillingGateResult =
  | { allowed: true }
  | { allowed: false; reason: string; status: SubscriptionStatus };

/**
 * Check whether the tenant is allowed to make an LLM request.
 *
 * Returns `{ allowed: true }` when:
 * - No IAM config (personal / self-hosted mode)
 * - No tenant context (personal / self-hosted mode)
 * - Tenant has an active subscription
 *
 * Returns `{ allowed: false, reason }` when the subscription is
 * missing, expired, or otherwise inactive.
 */
export async function checkBillingAllowance(params: {
  iamConfig?: GatewayIamConfig | null;
  tenant?: TenantContext | null;
  /** Optional JWT token for authenticated billing API calls. */
  token?: string;
}): Promise<BillingGateResult> {
  // Non-IAM mode — billing not enforced.
  if (!params.iamConfig || !params.tenant) {
    return { allowed: true };
  }

  try {
    const status = await getSubscriptionStatus(params.iamConfig, params.tenant, params.token);

    if (status.active) {
      return { allowed: true };
    }

    return {
      allowed: false,
      reason: status.subscription
        ? `Subscription "${status.subscription.displayName ?? status.subscription.name}" is not active (state: ${status.subscription.state ?? "unknown"})`
        : `No active subscription found for organization "${params.tenant.orgId}"`,
      status,
    };
  } catch (err) {
    // If the billing service is unreachable, fail open to avoid
    // blocking legitimate requests when IAM is temporarily down.
    // Log the error and allow.
    console.warn(
      `[billing-gate] Failed to check subscription for org "${params.tenant.orgId}": ${err instanceof Error ? err.message : String(err)}`,
    );
    return { allowed: true };
  }
}
