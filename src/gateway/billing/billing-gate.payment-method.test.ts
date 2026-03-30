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
  clientId: "hanzo-bot",
  orgName: "hanzo",
  appName: "hanzo-bot",
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

function mockSubscription(active: boolean, planSlug?: string) {
  vi.spyOn(client, "getSubscriptionStatus").mockResolvedValue({
    active,
    subscription: active ? { id: "sub-1", status: "active" } : null,
    plan: planSlug ? { slug: planSlug } : null,
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
    mockSubscription(true, "pro");

    const result = await checkBillingAllowance({ iamConfig: IAM_CONFIG, tenant: TENANT });

    expect(result.allowed).toBe(true);
    if (result.allowed) {
      expect(result.tier).toBe("pro");
    }
  });

  it("resolves tier from plan slug", async () => {
    mockBalance(100);
    mockSubscription(true, "team");

    const result = await checkBillingAllowance({ iamConfig: IAM_CONFIG, tenant: TENANT });

    expect(result.allowed).toBe(true);
    if (result.allowed) {
      expect(result.tier).toBe("team");
    }
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
