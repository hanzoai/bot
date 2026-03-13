import type { GatewayRequestHandler } from "./types.js";
import { ErrorCodes, errorShape, validateNodeInvokeResultParams } from "../protocol/index.js";
import { respondInvalidParams } from "./nodes.helpers.js";

function normalizeNodeInvokeResultParams(params: unknown): unknown {
  if (!params || typeof params !== "object") {
    return params;
  }
  const raw = params as Record<string, unknown>;
  const normalized: Record<string, unknown> = { ...raw };
  if (normalized.payloadJSON === null) {
    delete normalized.payloadJSON;
  } else if (normalized.payloadJSON !== undefined && typeof normalized.payloadJSON !== "string") {
    if (normalized.payload === undefined) {
      normalized.payload = normalized.payloadJSON;
    }
    delete normalized.payloadJSON;
  }
  if (normalized.error === null) {
    delete normalized.error;
  }
  return normalized;
}

export const handleNodeInvokeResult: GatewayRequestHandler = async ({
  params,
  respond,
  context,
  client,
}) => {
  const normalizedParams = normalizeNodeInvokeResultParams(params);
  if (!validateNodeInvokeResultParams(normalizedParams)) {
    respondInvalidParams({
      respond,
      method: "node.invoke.result",
      validator: validateNodeInvokeResultParams,
    });
    return;
  }
  const p = normalizedParams as {
    id: string;
    nodeId: string;
    ok: boolean;
    payload?: unknown;
    payloadJSON?: string | null;
    error?: { code?: string; message?: string } | null;
  };
  // Resolve the caller's node ID using the same logic as NodeRegistry.register:
  // prefer device.id (local nodes with key pairs), then instanceId (cloud nodes),
  // then client.id (client name — last resort, may differ from the nodeId).
  const callerConnect = client?.connect;
  const callerInstanceId =
    typeof (callerConnect?.client as { instanceId?: string })?.instanceId === "string"
      ? ((callerConnect?.client as { instanceId?: string }).instanceId?.trim() ?? "")
      : "";
  const callerNodeId =
    callerConnect?.device?.id ?? (callerInstanceId || callerConnect?.client?.id);
  if (callerNodeId && callerNodeId !== p.nodeId) {
    respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "nodeId mismatch"));
    return;
  }

  const ok = context.nodeRegistry.handleInvokeResult({
    id: p.id,
    nodeId: p.nodeId,
    ok: p.ok,
    payload: p.payload,
    payloadJSON: p.payloadJSON ?? null,
    error: p.error ?? null,
  });
  if (!ok) {
    // Late-arriving results (after invoke timeout) are expected and harmless.
    // Return success instead of error to reduce log noise; client can discard.
    context.logGateway.debug(`late invoke result ignored: id=${p.id} node=${p.nodeId}`);
    respond(true, { ok: true, ignored: true }, undefined);
    return;
  }

  respond(true, { ok: true }, undefined);
};
