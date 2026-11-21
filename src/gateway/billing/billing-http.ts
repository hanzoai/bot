/**
 * The HTTP face of the billing gate: one refusal body for every paid request the
 * gateway serves, so no path answers a money refusal its own way.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { resolveDefaultModelForAgent } from "../../agents/model-selection.js";
import { loadConfig } from "../../config/config.js";
import { validateIamToken } from "../auth-iam.js";
import type { ResolvedGatewayAuth } from "../auth.js";
import { sendJson } from "../http-common.js";
import { getBearerToken, resolveAgentIdForRequest, resolveNamedModel } from "../http-utils.js";
import { resolveTenantContext } from "../tenant-context.js";
import { checkBillingAllowance, type BillingGateResult } from "./billing-gate.js";

type Refusal = Extract<BillingGateResult, { allowed: false }>;

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
 * Gate a paid request on the caller's plan and balance. Undefined when it was
 * refused and the answer is already sent; otherwise the model to run, which is
 * the one the request names, the plan's own when the plan lacks the agent's
 * default, or undefined for the agent's default. A gateway that is not in IAM
 * mode serves its own operator and bills no one.
 *
 * `requested` is the request's `model` field: an agent selector, or a model.
 */
export async function billRequest(
  req: IncomingMessage,
  res: ServerResponse,
  params: { auth: ResolvedGatewayAuth; requested: string | undefined },
): Promise<{ model?: string } | undefined> {
  const { auth } = params;
  const named = resolveNamedModel(params.requested);
  if (auth.mode !== "iam" || !auth.iam) {
    return { model: named };
  }
  const token = getBearerToken(req);
  const iamResult = token ? await validateIamToken(token, auth.iam) : undefined;
  if (!iamResult?.ok) {
    // Authorized yet not an IAM token: the shared gateway token of an operator's
    // own node, which no account pays for.
    return { model: named };
  }
  const tenant = resolveTenantContext({ iamResult });
  if (!tenant) {
    sendBillingRefusal(res, {
      allowed: false,
      reason: "No billing account for this token",
      code: "payment_required",
    });
    return undefined;
  }
  const agentId = resolveAgentIdForRequest({ req, model: params.requested });
  const ref = resolveDefaultModelForAgent({ cfg: loadConfig(), agentId });
  const verdict = await checkBillingAllowance({
    iamConfig: auth.iam,
    tenant,
    token,
    model: named ?? `${ref.provider}/${ref.model}`,
    named: named !== undefined,
  });
  if (!verdict.allowed) {
    sendBillingRefusal(res, verdict);
    return undefined;
  }
  return { model: verdict.model ?? named };
}
