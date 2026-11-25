import {
  approveDevicePairing,
  listDevicePairing,
  removePairedDevice,
  type DeviceAuthToken,
  rejectDevicePairing,
  revokeDeviceToken,
  rotateDeviceToken,
  summarizeDeviceTokens,
} from "../../infra/device-pairing.js";
import { roleScopesAllow } from "../../shared/operator-scope-compat.js";
import {
  ErrorCodes,
  errorShape,
  formatValidationErrors,
  validateDevicePairApproveParams,
  validateDevicePairListParams,
  validateDevicePairRemoveParams,
  validateDevicePairRejectParams,
  validateDeviceTokenRevokeParams,
  validateDeviceTokenRotateParams,
} from "../protocol/index.js";
import type { GatewayClient, GatewayRequestHandlers } from "./types.js";

function redactPairedDevice(
  device: { tokens?: Record<string, DeviceAuthToken> } & Record<string, unknown>,
) {
  const { tokens, approvedScopes: _approvedScopes, ...rest } = device;
  return {
    ...rest,
    tokens: summarizeDeviceTokens(tokens),
  };
}

function getCallerScopes(client: GatewayClient | null): string[] {
  if (!client?.connect?.scopes) {
    return [];
  }
  return client.connect.scopes.map((s) => s.trim()).filter(Boolean);
}

/**
 * Platform admin predicate for device management methods:
 * - For IAM-authenticated clients: SuperAdmin iff verified IAM `owner === "admin"` (`identity.isSuperAdmin === true`).
 * - For non-IAM callers (shared gateway token / paired operator device): holds `operator.admin`.
 */
function isPlatformAdmin(client: GatewayClient | null, callerScopes: string[]): boolean {
  if (client?.identity?.method === "iam") {
    return client.identity.isSuperAdmin === true;
  }
  return callerScopes.includes("operator.admin");
}

function callerCoversScopes(params: {
  role: string;
  targetScopes: readonly string[];
  callerScopes: readonly string[];
}): boolean {
  const normalizedTarget = params.targetScopes.map((s) => s.trim()).filter(Boolean);
  if (normalizedTarget.length === 0) {
    return true;
  }
  return roleScopesAllow({
    role: params.role,
    requestedScopes: normalizedTarget,
    allowedScopes: params.callerScopes,
  });
}

export const deviceHandlers: GatewayRequestHandlers = {
  "device.pair.list": async ({ params, respond }) => {
    if (!validateDevicePairListParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid device.pair.list params: ${formatValidationErrors(
            validateDevicePairListParams.errors,
          )}`,
        ),
      );
      return;
    }
    const list = await listDevicePairing();
    respond(
      true,
      {
        pending: list.pending,
        paired: list.paired.map((device) => redactPairedDevice(device)),
      },
      undefined,
    );
  },
  "device.pair.approve": async ({ params, respond, context, client }) => {
    if (!validateDevicePairApproveParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid device.pair.approve params: ${formatValidationErrors(
            validateDevicePairApproveParams.errors,
          )}`,
        ),
      );
      return;
    }
    const { requestId } = params as { requestId: string };
    // Caller-scope enforcement: when a client is present, non-admin callers can only
    // approve scopes they hold themselves (including rejecting empty callerScopes) and
    // cannot self-approve their own device request.
    if (client) {
      const callerScopes = getCallerScopes(client);
      const callerIsAdmin = isPlatformAdmin(client, callerScopes);
      const pending = await listDevicePairing().then((l) =>
        l.pending.find((p) => p.requestId === requestId),
      );
      if (pending && !callerIsAdmin) {
        const callerDeviceId = client.connect?.device?.id?.trim();
        if (callerDeviceId && callerDeviceId === pending.deviceId) {
          respond(
            false,
            undefined,
            errorShape(ErrorCodes.INVALID_REQUEST, "cannot self-approve device pairing request"),
          );
          return;
        }
        const canApprove = callerCoversScopes({
          role: pending.role ?? "operator",
          targetScopes: pending.scopes ?? [],
          callerScopes,
        });
        if (!canApprove) {
          respond(
            false,
            undefined,
            errorShape(ErrorCodes.INVALID_REQUEST, "cannot approve scopes you do not hold"),
          );
          return;
        }
      }
    }
    const approverSub = client?.identity?.userId;
    const approved = await approveDevicePairing(requestId, undefined, approverSub);
    if (!approved) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "unknown requestId"));
      return;
    }
    context.logGateway.info(
      `device pairing approved device=${approved.device.deviceId} role=${approved.device.role ?? "unknown"}`,
    );
    context.broadcast(
      "device.pair.resolved",
      {
        requestId,
        deviceId: approved.device.deviceId,
        decision: "approved",
        ts: Date.now(),
      },
      { dropIfSlow: true },
    );
    respond(true, { requestId, device: redactPairedDevice(approved.device) }, undefined);
  },
  "device.pair.reject": async ({ params, respond, context }) => {
    if (!validateDevicePairRejectParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid device.pair.reject params: ${formatValidationErrors(
            validateDevicePairRejectParams.errors,
          )}`,
        ),
      );
      return;
    }
    const { requestId } = params as { requestId: string };
    const rejected = await rejectDevicePairing(requestId);
    if (!rejected) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "unknown requestId"));
      return;
    }
    context.broadcast(
      "device.pair.resolved",
      {
        requestId,
        deviceId: rejected.deviceId,
        decision: "rejected",
        ts: Date.now(),
      },
      { dropIfSlow: true },
    );
    respond(true, rejected, undefined);
  },
  "device.pair.remove": async ({ params, respond, context, client }) => {
    if (!validateDevicePairRemoveParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid device.pair.remove params: ${formatValidationErrors(
            validateDevicePairRemoveParams.errors,
          )}`,
        ),
      );
      return;
    }
    const { deviceId } = params as { deviceId: string };
    if (client) {
      const callerScopes = getCallerScopes(client);
      const callerIsAdmin = isPlatformAdmin(client, callerScopes);
      const paired = await listDevicePairing().then((l) =>
        l.paired.find((d) => d.deviceId === deviceId),
      );
      if (paired && !callerIsAdmin) {
        const canRemove = callerCoversScopes({
          role: paired.role ?? "operator",
          targetScopes: paired.scopes ?? paired.approvedScopes ?? [],
          callerScopes,
        });
        if (!canRemove) {
          respond(
            false,
            undefined,
            errorShape(
              ErrorCodes.INVALID_REQUEST,
              "cannot remove device with scopes you do not hold",
            ),
          );
          return;
        }
      }
    }
    const removed = await removePairedDevice(deviceId);
    if (!removed) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "unknown deviceId"));
      return;
    }
    context.logGateway.info(`device pairing removed device=${removed.deviceId}`);
    respond(true, removed, undefined);
  },
  "device.token.rotate": async ({ params, respond, context, client }) => {
    if (!validateDeviceTokenRotateParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid device.token.rotate params: ${formatValidationErrors(
            validateDeviceTokenRotateParams.errors,
          )}`,
        ),
      );
      return;
    }
    const { deviceId, role, scopes } = params as {
      deviceId: string;
      role: string;
      scopes?: string[];
    };
    const callerScopes = client ? getCallerScopes(client) : undefined;
    const callerIsAdmin = client ? isPlatformAdmin(client, callerScopes ?? []) : true;
    const entry = await rotateDeviceToken({
      deviceId,
      role,
      scopes,
      callerScopes,
      callerIsPlatformAdmin: callerIsAdmin,
    });
    if (!entry) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "unknown deviceId/role or scope not allowed"),
      );
      return;
    }
    context.logGateway.info(
      `device token rotated device=${deviceId} role=${entry.role} scopes=${entry.scopes.join(",")}`,
    );
    respond(
      true,
      {
        deviceId,
        role: entry.role,
        token: entry.token,
        scopes: entry.scopes,
        rotatedAtMs: entry.rotatedAtMs ?? entry.createdAtMs,
      },
      undefined,
    );
  },
  "device.token.revoke": async ({ params, respond, context, client }) => {
    if (!validateDeviceTokenRevokeParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid device.token.revoke params: ${formatValidationErrors(
            validateDeviceTokenRevokeParams.errors,
          )}`,
        ),
      );
      return;
    }
    const { deviceId, role } = params as { deviceId: string; role: string };
    const callerScopes = client ? getCallerScopes(client) : undefined;
    const callerIsAdmin = client ? isPlatformAdmin(client, callerScopes ?? []) : true;
    const entry = await revokeDeviceToken({
      deviceId,
      role,
      callerScopes,
      callerIsPlatformAdmin: callerIsAdmin,
    });
    if (!entry) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "unknown deviceId/role or scope not allowed"),
      );
      return;
    }
    context.logGateway.info(`device token revoked device=${deviceId} role=${entry.role}`);
    respond(
      true,
      { deviceId, role: entry.role, revokedAtMs: entry.revokedAtMs ?? Date.now() },
      undefined,
    );
  },
};
