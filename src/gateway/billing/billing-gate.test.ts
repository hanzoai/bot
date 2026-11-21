/**
 * Tests for the billing gate: the caller's own tier from cloud decides. A
 * request runs while the effective balance is above zero and the plan names the
 * model; a spent balance or a model outside the plan is a refusal.
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

function mockTier(opts: { cents: number; tier?: string; allowedModels?: string[] }) {
  vi.spyOn(client, "getTier").mockResolvedValue({
    tier: { name: opts.tier ?? "free", allowedModels: opts.allowedModels ?? ["*"] },
    balance: { effectiveAvailable: opts.cents },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  client.resetBillingClient();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

const TOKEN = "caller-token";

describe("checkBillingAllowance", () => {
  it("allows a caller with credit left", async () => {
    mockTier({ cents: 500 });

    const result = await checkBillingAllowance({
      iamConfig: IAM_CONFIG,
      tenant: TENANT,
      token: TOKEN,
    });

    expect(result.allowed).toBe(true);
  });

  it("refuses a paid plan whose balance is spent", async () => {
    mockTier({ cents: 0, tier: "pro" });

    const result = await checkBillingAllowance({
      iamConfig: IAM_CONFIG,
      tenant: TENANT,
      token: TOKEN,
    });

    expect(result).toMatchObject({ allowed: false, code: "payment_required" });
  });

  it("serves the free plan's own models at zero balance", async () => {
    mockTier({ cents: 0, tier: "free", allowedModels: ["enso", "enso-auto"] });

    const result = await checkBillingAllowance({
      iamConfig: IAM_CONFIG,
      tenant: TENANT,
      token: TOKEN,
      model: "hanzo/enso-auto",
      named: true,
    });

    expect(result).toMatchObject({ allowed: true });
    expect(result).not.toHaveProperty("model");
  });

  it("refuses a model the plan does not name, and says which", async () => {
    mockTier({ cents: 500, allowedModels: ["zen-free"] });

    const result = await checkBillingAllowance({
      iamConfig: IAM_CONFIG,
      tenant: TENANT,
      token: TOKEN,
      model: "hanzo/zen6",
      named: true,
    });

    expect(result).toMatchObject({
      allowed: false,
      code: "model_not_in_plan",
      model: "hanzo/zen6",
    });
  });

  it("refuses a paid model to a free account at zero balance, as outside the plan", async () => {
    mockTier({ cents: 0, tier: "free", allowedModels: ["enso", "enso-auto"] });

    const result = await checkBillingAllowance({
      iamConfig: IAM_CONFIG,
      tenant: TENANT,
      token: TOKEN,
      model: "hanzo/zen6",
      named: true,
    });

    expect(result).toMatchObject({
      allowed: false,
      code: "model_not_in_plan",
      model: "hanzo/zen6",
    });
  });

  it("runs the plan's own model when the agent's default is outside it and none was named", async () => {
    mockTier({ cents: 0, tier: "free", allowedModels: ["enso", "enso-auto"] });

    const result = await checkBillingAllowance({
      iamConfig: IAM_CONFIG,
      tenant: TENANT,
      token: TOKEN,
      model: "hanzo/zen6",
      named: false,
    });

    expect(result).toMatchObject({ allowed: true, model: "enso" });
  });

  it("allows a model the plan names, with or without the provider prefix", async () => {
    mockTier({ cents: 500, tier: "pro", allowedModels: ["zen6"] });

    const result = await checkBillingAllowance({
      iamConfig: IAM_CONFIG,
      tenant: TENANT,
      token: TOKEN,
      model: "hanzo/zen6",
    });

    expect(result).toMatchObject({ allowed: true, tier: "pro" });
  });

  it("allows every model when the plan lists a wildcard", async () => {
    mockTier({ cents: 500, allowedModels: ["*"] });

    const result = await checkBillingAllowance({
      iamConfig: IAM_CONFIG,
      tenant: TENANT,
      token: TOKEN,
      model: "hanzo/zen6",
    });

    expect(result.allowed).toBe(true);
  });

  it("no role passes without a plan read: an admin's org is metered like any other", async () => {
    const admin = { ...TENANT, orgId: "admin", userName: "z@hanzo.ai" };

    mockTier({ cents: 5000, tier: "pro", allowedModels: ["*"] });
    const funded = await checkBillingAllowance({
      iamConfig: IAM_CONFIG,
      tenant: admin,
      token: TOKEN,
      model: "hanzo/zen6",
      named: true,
    });
    expect(funded).toMatchObject({ allowed: true });

    mockTier({ cents: 0, tier: "pro", allowedModels: ["*"] });
    const empty = await checkBillingAllowance({
      iamConfig: IAM_CONFIG,
      tenant: admin,
      token: TOKEN,
      model: "hanzo/zen6",
      named: true,
    });
    expect(empty).toMatchObject({ allowed: false, code: "payment_required" });
  });

  it("no IAM config means no billing enforced (self-hosted)", async () => {
    const result = await checkBillingAllowance({ tenant: TENANT });

    expect(result.allowed).toBe(true);
  });

  it("open gate mode allows all (development/testing)", async () => {
    vi.stubEnv("BILLING_GATE_MODE", "open");

    const result = await checkBillingAllowance({ iamConfig: IAM_CONFIG, tenant: TENANT });

    expect(result.allowed).toBe(true);
  });

  it("an unreadable plan is billing_unavailable, never a paywall", async () => {
    vi.spyOn(client, "getTier").mockRejectedValue(new Error("network error"));

    const result = await checkBillingAllowance({
      iamConfig: IAM_CONFIG,
      tenant: TENANT,
      token: TOKEN,
    });

    expect(result).toMatchObject({ allowed: false, code: "billing_unavailable" });
  });

  it("a request with no bearer token cannot be billed", async () => {
    const result = await checkBillingAllowance({ iamConfig: IAM_CONFIG, tenant: TENANT });

    expect(result).toMatchObject({ allowed: false, code: "billing_unavailable" });
  });

  it("warn mode allows when cloud is unreachable (staging)", async () => {
    vi.stubEnv("BILLING_GATE_MODE", "warn");
    vi.spyOn(client, "getTier").mockRejectedValue(new Error("network error"));

    const result = await checkBillingAllowance({
      iamConfig: IAM_CONFIG,
      tenant: TENANT,
      token: TOKEN,
    });

    expect(result.allowed).toBe(true);
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

    expect(result).toMatchObject({ allowed: false, code: "payment_required" });
  });
});
