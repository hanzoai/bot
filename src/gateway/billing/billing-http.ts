/**
 * The HTTP face of the billing gate: one tenant lookup and one refusal body for
 * every paid request the gateway serves, so no path answers a money refusal its
 * own way.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { resolveDefaultModelForAgent } from "../../agents/model-selection.js";
import { loadConfig, type GatewayIamConfig } from "../../config/config.js";
import { validateIamToken } from "../auth-iam.js";
import type { ResolvedGatewayAuth } from "../auth.js";
import { sendJson } from "../http-common.js";
import { getBearerToken, resolveAgentIdForRequest } from "../http-utils.js";
import { resolveTenantContext, type TenantContext } from "../tenant-context.js";
import { checkBillingAllowance, type BillingGateResult } from "./billing-gate.js";

type Refusal = Extract<BillingGateResult, { allowed: false }>;

/** The tenant an IAM bearer token belongs to, or undefined when it is not one. */
export async function resolveIamTenant(
  iamConfig: GatewayIamConfig,
  token: string,
): Promise<TenantContext | undefined> {
  const iamResult = await validateIamToken(token, iamConfig);
  return iamResult.ok ? (resolveTenantContext({ iamResult }) ?? undefined) : undefined;
}

/**
 * Answer a refused paid request: 402 with the page that clears it, or 503 when
 * billing could not be read, so a caller never mistakes an outage for a paywall.
 */
export function sendBillingRefusal(res: ServerResponse, refusal: Refusal): void {
  if (refusal.code === "billing_unavailable") {
    res.setHeader("Retry-After", "5");
    sendJson(res, 503, {
      error: { message: refusal.reason, type: "api_error", code: refusal.code },
    });
    return;
  }
  sendJson(res, 402, {
    error: {
      message: refusal.reason,
      type: "billing_error",
      code: refusal.code,
      ...(refusal.model ? { model: refusal.model } : {}),
      ...(process.env.BILLING_URL ? { billingUrl: process.env.BILLING_URL } : {}),
    },
  });
}

/**
 * Gate a paid request on the caller's plan and balance. True when it was
 * refused and the answer is already sent. A gateway that is not in IAM mode
 * serves its own operator and bills no one.
 *
 * `requested` is the request's `model` field, which names the agent; the plan
 * is checked against the model that agent runs.
 */
export async function refuseUnbilled(
  req: IncomingMessage,
  res: ServerResponse,
  params: { auth: ResolvedGatewayAuth; requested: string | undefined },
): Promise<boolean> {
  const { auth } = params;
  if (auth.mode !== "iam" || !auth.iam) {
    return false;
  }
  const agentId = resolveAgentIdForRequest({ req, model: params.requested });
  const ref = resolveDefaultModelForAgent({ cfg: loadConfig(), agentId });
  const model = `${ref.provider}/${ref.model}`;
  const token = getBearerToken(req);
  const tenant = token ? await resolveIamTenant(auth.iam, token) : undefined;
  if (!tenant) {
    // Authorized yet not an IAM token: the shared gateway token of an operator's
    // own node, which no account pays for.
    return false;
  }
  const verdict = await checkBillingAllowance({ iamConfig: auth.iam, tenant, token, model });
  if (verdict.allowed) {
    return false;
  }
  sendBillingRefusal(res, verdict);
  return true;
}
