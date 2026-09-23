/**
 * Tests for the billing gate.
 *
 * Free tier: $5 starter credit granted at signup (no card required).
 * Gate allows requests while credit balance > 0 or subscription is active.
 * Card is still verified via pre-auth when users voluntarily add one.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkBillingAllowance } from "./billing-gate.js";
import * as client from "./iam-billing-client.js";

const IAM_CONFIG = {
  mode: "iam" as const,
  serverUrl: "https://hanzo.id",
  clientId: "bot",
  orgName: "hanzo",
  appName: "bot",
  jwksUrl: "http://iam.hanzo.svc/.well-known/jwks",
};

const TENANT = {
  orgId: "user-test-1",
  userId: "user-test-1",
  userName: "test@example.com",
};

function mockBalance(cents: number) {
  vi.spyOn(client, "getBalance").mockResolvedValue(cents);
}

function mockSubscription(active: boolean) {
  return vi.spyOn(client, "getSubscriptionStatus").mockResolvedValue({
    active,
    subscription: active ? { id: "sub-1", status: "active" } : null,
    plan: active ? { id: "plan-pro", name: "Pro" } : null,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  client.resetBillingClient();
  vi.restoreAllMocks();
});

describe("checkBillingAllowance — free tier with starter credit", () => {
  it("allows new user with $5 starter credit (no card required)", async () => {
    mockBalance(500); // $5.00 starter credit
    mockSubscription(false);

    const result = await checkBillingAllowance({ iamConfig: IAM_CONFIG, tenant: TENANT });

    expect(result.allowed).toBe(true);
  });

  it("blocks when credit is exhausted and no subscription", async () => {
    mockBalance(0);
    mockSubscription(false);

    const result = await checkBillingAllowance({ iamConfig: IAM_CONFIG, tenant: TENANT });

    expect(result.allowed).toBe(false);
    expect((result as { reason: string }).reason).toMatch(/insufficient funds/i);
  });

  it("allows paid subscribers even with zero credit balance", async () => {
    mockBalance(0);
    mockSubscription(true);

    const result = await checkBillingAllowance({ iamConfig: IAM_CONFIG, tenant: TENANT });

    expect(result.allowed).toBe(true);
  });

  it("reads the tenant org's balance and skips subscriptions when funded", async () => {
    mockBalance(100);
    const subs = mockSubscription(true);

    const result = await checkBillingAllowance({
      iamConfig: IAM_CONFIG,
      tenant: { ...TENANT, orgId: "acme" },
      token: "user-jwt",
    });

    expect(result.allowed).toBe(true);
    expect(client.getBalance).toHaveBeenCalledWith(IAM_CONFIG, "acme", "user-jwt");
    expect(subs).not.toHaveBeenCalled();
  });

  it("refuses an org the gateway is not granted, even in warn mode", async () => {
    vi.stubEnv("BILLING_GATE_MODE", "warn");
    vi.spyOn(client, "getBalance").mockRejectedValue(
      new client.OrgNotGrantedError("user-test-1", "hanzo"),
    );

    const result = await checkBillingAllowance({ iamConfig: IAM_CONFIG, tenant: TENANT });

    expect(result.allowed).toBe(false);
    expect((result as { reason: string }).reason).toMatch(/not authorized/i);
  });

  it("super admins bypass all checks", async () => {
    const superAdminTenant = { ...TENANT, userName: "z@hanzo.ai" };

    const result = await checkBillingAllowance({
      iamConfig: IAM_CONFIG,
      tenant: superAdminTenant,
    });

    expect(result.allowed).toBe(true);
    if (result.allowed) {
      expect(result.tier).toBe("enterprise");
    }
  });

  it("no IAM config means no billing enforced (self-hosted)", async () => {
    const result = await checkBillingAllowance({ tenant: TENANT });

    expect(result.allowed).toBe(true);
  });

  it("open gate mode allows all (development/testing)", async () => {
    const env = process.env.BILLING_GATE_MODE;
    process.env.BILLING_GATE_MODE = "open";

    try {
      const result = await checkBillingAllowance({ iamConfig: IAM_CONFIG, tenant: TENANT });
      expect(result.allowed).toBe(true);
    } finally {
      if (env === undefined) {
        delete process.env.BILLING_GATE_MODE;
      } else {
        process.env.BILLING_GATE_MODE = env;
      }
    }
  });

  it("Commerce API failure fails closed by default (production)", async () => {
    vi.spyOn(client, "getBalance").mockRejectedValue(new Error("network error"));
    vi.spyOn(client, "getSubscriptionStatus").mockRejectedValue(new Error("network error"));

    const result = await checkBillingAllowance({ iamConfig: IAM_CONFIG, tenant: TENANT });

    expect(result.allowed).toBe(false);
  });

  it("warn mode allows when Commerce is unreachable (staging)", async () => {
    const env = process.env.BILLING_GATE_MODE;
    process.env.BILLING_GATE_MODE = "warn";

    vi.spyOn(client, "getBalance").mockRejectedValue(new Error("network error"));
    vi.spyOn(client, "getSubscriptionStatus").mockRejectedValue(new Error("network error"));

    try {
      const result = await checkBillingAllowance({ iamConfig: IAM_CONFIG, tenant: TENANT });
      expect(result.allowed).toBe(true);
    } finally {
      if (env === undefined) {
        delete process.env.BILLING_GATE_MODE;
      } else {
        process.env.BILLING_GATE_MODE = env;
      }
    }
  });

  it("dedicated mode uses node budget independently of global billing", async () => {
    const result = await checkBillingAllowance({
      iamConfig: IAM_CONFIG,
      tenant: TENANT,
      nodeBillingMode: "dedicated",
      nodeBudgetCents: 1000,
      nodeSpentCents: 500,
    });

    expect(result.allowed).toBe(true);
  });

  it("dedicated mode blocks when node budget is exhausted", async () => {
    const result = await checkBillingAllowance({
      iamConfig: IAM_CONFIG,
      tenant: TENANT,
      nodeBillingMode: "dedicated",
      nodeBudgetCents: 500,
      nodeSpentCents: 600,
    });

    expect(result.allowed).toBe(false);
  });
});
