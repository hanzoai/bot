import type { ConnectParams } from "../../protocol/index.js";
import type { GatewayRole } from "../../role-policy.js";
import { roleCanSkipDeviceIdentity } from "../../role-policy.js";

export type ControlUiAuthPolicy = {
  allowInsecureAuthConfigured: boolean;
  dangerouslyDisableDeviceAuth: boolean;
  allowBypass: boolean;
  device: ConnectParams["device"] | null | undefined;
};

export function resolveControlUiAuthPolicy(params: {
  isControlUi: boolean;
  controlUiConfig:
    | {
        allowInsecureAuth?: boolean;
        dangerouslyDisableDeviceAuth?: boolean;
      }
    | undefined;
  deviceRaw: ConnectParams["device"] | null | undefined;
}): ControlUiAuthPolicy {
  const allowInsecureAuthConfigured =
    params.isControlUi && params.controlUiConfig?.allowInsecureAuth === true;
  const dangerouslyDisableDeviceAuth =
    params.isControlUi && params.controlUiConfig?.dangerouslyDisableDeviceAuth === true;
  return {
    allowInsecureAuthConfigured,
    dangerouslyDisableDeviceAuth,
    // Control UI auth bypass is permanently disabled; never strip device identity
    // or skip authentication even when `dangerouslyDisableDeviceAuth` is configured.
    allowBypass: false,
    device: params.deviceRaw,
  };
}

export function shouldSkipControlUiPairing(
  _policy: ControlUiAuthPolicy,
  _sharedAuthOk: boolean,
  trustedProxyAuthOk = false,
): boolean {
  if (trustedProxyAuthOk) {
    return true;
  }
  return false;
}

export function isTrustedProxyControlUiOperatorAuth(params: {
  isControlUi: boolean;
  role: GatewayRole;
  authMode: string;
  authOk: boolean;
  authMethod: string | undefined;
}): boolean {
  return (
    params.isControlUi &&
    params.role === "operator" &&
    params.authMode === "trusted-proxy" &&
    params.authOk &&
    params.authMethod === "trusted-proxy"
  );
}

export type MissingDeviceIdentityDecision =
  | { kind: "allow" }
  | { kind: "reject-control-ui-insecure-auth" }
  | { kind: "reject-unauthorized" }
  | { kind: "reject-device-required" };

export function evaluateMissingDeviceIdentity(params: {
  hasDeviceIdentity: boolean;
  role: GatewayRole;
  isControlUi: boolean;
  controlUiAuthPolicy: ControlUiAuthPolicy;
  trustedProxyAuthOk?: boolean;
  sharedAuthOk: boolean;
  authOk: boolean;
  authMethod?: string;
  hasSharedAuth: boolean;
  isLocalClient: boolean;
}): MissingDeviceIdentityDecision {
  if (params.hasDeviceIdentity) {
    return { kind: "allow" };
  }
  if (params.isControlUi && params.trustedProxyAuthOk) {
    return { kind: "allow" };
  }
  // IAM-authenticated connections (any role, including Control UI) can skip
  // device pairing — the OIDC JWT already provides verified identity through
  // the IAM provider.
  if (params.authOk && params.authMethod === "iam") {
    return { kind: "allow" };
  }
  if (params.isControlUi) {
    // Allow localhost Control UI connections when allowInsecureAuth is configured
    // AND authentication succeeded. Localhost has no network interception risk,
    // and browser SubtleCrypto (needed for device identity) is unavailable in
    // insecure HTTP contexts. Remote connections are always rejected.
    if (!params.controlUiAuthPolicy.allowInsecureAuthConfigured || !params.isLocalClient) {
      return { kind: "reject-control-ui-insecure-auth" };
    }
    if (!params.authOk) {
      return { kind: "reject-unauthorized" };
    }
    return { kind: "allow" };
  }
  // Node role with shared-token auth can skip device identity. Cloud-
  // provisioned nodes carry the gateway token (BOT_GATEWAY_TOKEN) which
  // proves they are trusted infrastructure. They don't have device keys
  // because they are ephemeral K8s pods.
  if (params.role === "node" && params.sharedAuthOk) {
    return { kind: "allow" };
  }
  if (roleCanSkipDeviceIdentity(params.role, params.sharedAuthOk)) {
    return { kind: "allow" };
  }
  if (!params.authOk && params.hasSharedAuth) {
    return { kind: "reject-unauthorized" };
  }
  return { kind: "reject-device-required" };
}
