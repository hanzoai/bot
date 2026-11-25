import { describe, expect, test } from "vitest";
import { evaluateMissingDeviceIdentity, resolveControlUiAuthPolicy } from "./connect-policy.js";

describe("control-ui auth bypass removal", () => {
  test("allowBypass is always false even when dangerouslyDisableDeviceAuth is true", () => {
    const policy = resolveControlUiAuthPolicy({
      isControlUi: true,
      controlUiConfig: { dangerouslyDisableDeviceAuth: true },
      deviceRaw: null,
    });
    expect(policy.allowBypass).toBe(false);
    expect(policy.dangerouslyDisableDeviceAuth).toBe(true);
  });

  test("unauthenticated remote control-ui is rejected even with dangerouslyDisableDeviceAuth", () => {
    const policy = resolveControlUiAuthPolicy({
      isControlUi: true,
      controlUiConfig: { dangerouslyDisableDeviceAuth: true },
      deviceRaw: null,
    });

    const decision = evaluateMissingDeviceIdentity({
      hasDeviceIdentity: false,
      role: "operator",
      isControlUi: true,
      controlUiAuthPolicy: policy,
      trustedProxyAuthOk: false,
      sharedAuthOk: false,
      authOk: false,
      hasSharedAuth: false,
      isLocalClient: false,
    });
    expect(decision.kind).toBe("reject-control-ui-insecure-auth");
  });

  test("unauthenticated loopback control-ui is rejected even with allowInsecureAuth", () => {
    const policy = resolveControlUiAuthPolicy({
      isControlUi: true,
      controlUiConfig: { allowInsecureAuth: true, dangerouslyDisableDeviceAuth: true },
      deviceRaw: null,
    });

    const decision = evaluateMissingDeviceIdentity({
      hasDeviceIdentity: false,
      role: "operator",
      isControlUi: true,
      controlUiAuthPolicy: policy,
      trustedProxyAuthOk: false,
      sharedAuthOk: false,
      authOk: false,
      hasSharedAuth: false,
      isLocalClient: true,
    });
    expect(decision.kind).toBe("reject-unauthorized");
  });

  test("control-ui with IAM auth skips device identity", () => {
    const policy = resolveControlUiAuthPolicy({
      isControlUi: true,
      controlUiConfig: { dangerouslyDisableDeviceAuth: false },
      deviceRaw: null,
    });

    const decision = evaluateMissingDeviceIdentity({
      hasDeviceIdentity: false,
      role: "operator",
      isControlUi: true,
      controlUiAuthPolicy: policy,
      trustedProxyAuthOk: false,
      sharedAuthOk: false,
      authOk: true,
      authMethod: "iam",
      hasSharedAuth: false,
      isLocalClient: false,
    });
    expect(decision.kind).toBe("allow");
  });

  test("control-ui with shared auth on loopback skips device identity when allowInsecureAuth is set", () => {
    const policy = resolveControlUiAuthPolicy({
      isControlUi: true,
      controlUiConfig: { allowInsecureAuth: true },
      deviceRaw: null,
    });

    const decision = evaluateMissingDeviceIdentity({
      hasDeviceIdentity: false,
      role: "operator",
      isControlUi: true,
      controlUiAuthPolicy: policy,
      trustedProxyAuthOk: false,
      sharedAuthOk: true,
      authOk: true,
      hasSharedAuth: true,
      isLocalClient: true,
    });
    expect(decision.kind).toBe("allow");
  });

  test("control-ui without allowInsecureAuth is rejected on loopback without device identity", () => {
    const policy = resolveControlUiAuthPolicy({
      isControlUi: true,
      controlUiConfig: { dangerouslyDisableDeviceAuth: false },
      deviceRaw: null,
    });

    const decision = evaluateMissingDeviceIdentity({
      hasDeviceIdentity: false,
      role: "operator",
      isControlUi: true,
      controlUiAuthPolicy: policy,
      trustedProxyAuthOk: false,
      sharedAuthOk: true,
      authOk: true,
      hasSharedAuth: true,
      isLocalClient: true,
    });
    expect(decision.kind).toBe("reject-control-ui-insecure-auth");
  });
});
