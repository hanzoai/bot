import type { IncomingMessage } from "node:http";
import { describe, expect, it, vi } from "vitest";
import {
  authorizeGatewayConnect,
  authorizeHttpGatewayConnect,
  authorizeWsControlUiGatewayConnect,
  resolveGatewayAuth,
} from "./auth.js";

const loopbackReq = { socket: { remoteAddress: "127.0.0.1" } } as unknown as IncomingMessage;

function createLimiterSpy() {
  const check = vi.fn((_ip, _scope) => ({ allowed: true, remaining: 10, retryAfterMs: 0 }));
  const recordFailure = vi.fn((_ip, _scope) => {});
  const reset = vi.fn((_ip, _scope) => {});
  return {
    check,
    recordFailure,
    reset,
    size: () => 0,
    prune: () => {},
    dispose: () => {},
  };
}

describe("gateway auth - IAM mode", () => {
  const iamAuth = resolveGatewayAuth({
    authConfig: {
      mode: "iam",
      token: "shared-token",
      iam: {
        serverUrl: "https://hanzo.id",
        clientId: "hanzo-bot",
      },
    },
    env: {} as NodeJS.ProcessEnv,
  });

  it("rejects shared gateway token for WS operator connections in IAM mode", async () => {
    const limiter = createLimiterSpy();
    const res = await authorizeWsControlUiGatewayConnect({
      auth: iamAuth,
      role: "operator",
      connectAuth: { token: "shared-token" },
      req: loopbackReq,
      trustedProxies: ["127.0.0.1"],
      rateLimiter: limiter,
    });

    expect(res.ok).toBe(false);
    expect(res.reason).toBe("iam_validation_failed");
  });

  it("rejects shared gateway token for operator role even on direct authorizeGatewayConnect", async () => {
    const res = await authorizeGatewayConnect({
      auth: iamAuth,
      role: "operator",
      connectAuth: { token: "shared-token" },
      req: loopbackReq,
      trustedProxies: ["127.0.0.1"],
    });

    expect(res.ok).toBe(false);
    expect(res.reason).toBe("iam_validation_failed");
  });

  it("allows shared gateway token for node role in IAM mode (ephemeral K8s node pods)", async () => {
    const limiter = createLimiterSpy();
    const res = await authorizeWsControlUiGatewayConnect({
      auth: iamAuth,
      role: "node",
      connectAuth: { token: "shared-token" },
      req: loopbackReq,
      trustedProxies: ["127.0.0.1"],
      rateLimiter: limiter,
    });

    expect(res.ok).toBe(true);
    expect(res.method).toBe("token");
  });

  it("preserves internal operator HTTP shared gateway token in IAM mode", async () => {
    const res = await authorizeHttpGatewayConnect({
      auth: iamAuth,
      connectAuth: { token: "shared-token" },
      req: loopbackReq,
      trustedProxies: ["127.0.0.1"],
    });

    expect(res.ok).toBe(true);
    expect(res.method).toBe("token");
  });

  it("rejects missing token in IAM mode", async () => {
    const res = await authorizeGatewayConnect({
      auth: iamAuth,
      role: "operator",
      connectAuth: null,
      req: loopbackReq,
      trustedProxies: ["127.0.0.1"],
    });

    expect(res.ok).toBe(false);
    expect(res.reason).toBe("iam_token_missing");
  });

  it("shared token works in token mode", async () => {
    const limiter = createLimiterSpy();
    const auth = resolveGatewayAuth({
      authConfig: {
        mode: "token",
        token: "shared-token",
      },
      env: {} as NodeJS.ProcessEnv,
    });

    const res = await authorizeGatewayConnect({
      auth,
      connectAuth: { token: "shared-token" },
      req: loopbackReq,
      trustedProxies: ["127.0.0.1"],
      rateLimiter: limiter,
    });

    expect(res.ok).toBe(true);
    expect(res.method).toBe("token");
  });

  it("WS control UI with shared token works in token mode", async () => {
    const auth = resolveGatewayAuth({
      authConfig: {
        mode: "token",
        token: "shared-token",
      },
      env: {} as NodeJS.ProcessEnv,
    });

    const res = await authorizeWsControlUiGatewayConnect({
      auth,
      role: "operator",
      connectAuth: { token: "shared-token" },
      req: loopbackReq,
      trustedProxies: ["127.0.0.1"],
    });

    expect(res.ok).toBe(true);
    expect(res.method).toBe("token");
  });
});
