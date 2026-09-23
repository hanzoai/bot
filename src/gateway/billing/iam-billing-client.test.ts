import { beforeEach, describe, expect, it, vi } from "vitest";

const CFG = { serverUrl: "https://hanzo.id", clientId: "hanzo-bot" };
const TOKEN_URL = "https://hanzo.id/v1/iam/oauth/token";
const BASE = "http://cloud.hanzo.svc:8000";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** fetch that answers the IAM token endpoint and hands every other URL to `commerce`. */
function routedFetch(commerce: (url: string) => Response) {
  return vi.fn(async (url: string) =>
    url === TOKEN_URL ? json({ access_token: "app-token", expires_in: 3600 }) : commerce(url),
  );
}

function commerceCalls(fetchMock: ReturnType<typeof routedFetch>) {
  return fetchMock.mock.calls.filter(([url]) => url !== TOKEN_URL) as unknown as Array<
    [string, { headers: Record<string, string> }]
  >;
}

async function load() {
  vi.resetModules();
  return await import("./iam-billing-client.js");
}

beforeEach(() => {
  vi.stubEnv("IAM_CLIENT_ID", "");
  vi.stubEnv("IAM_CLIENT_SECRET", "s3cret");
  vi.stubEnv("COMMERCE_API_URL", "");
});

describe("getBalance", () => {
  it("forwards the user's own bearer as a caller-scoped read", async () => {
    const fetchMock = routedFetch(() => json({ available: 250, account: "someone/else" }));
    vi.stubGlobal("fetch", fetchMock);
    const { getBalance } = await load();

    await expect(getBalance(CFG, "acme", "user-jwt")).resolves.toBe(250);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = commerceCalls(fetchMock)[0];
    expect(url).toBe(`${BASE}/v1/billing/balance`);
    expect(init.headers.Authorization).toBe("Bearer user-jwt");
    expect(init.headers["X-Org-Id"]).toBeUndefined();
  });

  it("reads as the gateway application for the tenant's org without a user bearer", async () => {
    const fetchMock = routedFetch(() =>
      json({ balance: 600, holds: 100, available: 500, account: "acme" }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { getBalance } = await load();

    await expect(getBalance(CFG, "acme")).resolves.toBe(500);

    const [url, init] = commerceCalls(fetchMock)[0];
    expect(url).toBe(`${BASE}/v1/billing/balance`);
    expect(init.headers.Authorization).toBe("Bearer app-token");
    expect(init.headers["X-Org-Id"]).toBe("acme");
  });

  it("accepts a wallet inside the org", async () => {
    vi.stubGlobal(
      "fetch",
      routedFetch(() => json({ available: 7, account: "acme/user-1" })),
    );
    const { getBalance } = await load();

    await expect(getBalance(CFG, "acme")).resolves.toBe(7);
  });

  it("refuses an account outside the org it selected", async () => {
    vi.stubGlobal(
      "fetch",
      routedFetch(() => json({ available: 9999, account: "hanzo" })),
    );
    const { getBalance, OrgNotGrantedError } = await load();

    await expect(getBalance(CFG, "acme")).rejects.toBeInstanceOf(OrgNotGrantedError);
  });

  it("refuses a prefix that is not the org", async () => {
    vi.stubGlobal(
      "fetch",
      routedFetch(() => json({ available: 1, account: "acme-evil/u" })),
    );
    const { getBalance, OrgNotGrantedError } = await load();

    await expect(getBalance(CFG, "acme")).rejects.toBeInstanceOf(OrgNotGrantedError);
  });

  it("refuses an application read with no account", async () => {
    vi.stubGlobal(
      "fetch",
      routedFetch(() => json({ available: 1 })),
    );
    const { getBalance, OrgNotGrantedError } = await load();

    await expect(getBalance(CFG, "acme")).rejects.toBeInstanceOf(OrgNotGrantedError);
  });

  it("throws on a non-2xx answer and on a missing available", async () => {
    const answers = [json({ error: "down" }, 502), json({ account: "acme" })];
    vi.stubGlobal(
      "fetch",
      routedFetch(() => answers.shift() as Response),
    );
    const { getBalance } = await load();

    await expect(getBalance(CFG, "acme")).rejects.toThrow(/502/);
    await expect(getBalance(CFG, "acme")).rejects.toThrow(/available/);
  });

  it("honors COMMERCE_API_URL", async () => {
    vi.stubEnv("COMMERCE_API_URL", "https://api.hanzo.ai/");
    const fetchMock = routedFetch(() => json({ available: 1, account: "acme" }));
    vi.stubGlobal("fetch", fetchMock);
    const { getBalance } = await load();

    await getBalance(CFG, "acme");

    expect(commerceCalls(fetchMock)[0][0]).toBe("https://api.hanzo.ai/v1/billing/balance");
  });
});

describe("getSubscriptionStatus", () => {
  const TENANT = { orgId: "acme", userId: "acme/user-1" };

  it("maps cloud's subscription rows, scoped by the same bearer choice", async () => {
    const pro = {
      id: "sub-2",
      userId: "user-1",
      planId: "plan-pro",
      status: "trialing",
      plan: { id: "plan-pro", name: "Pro", price: 2000, currency: "usd", interval: "month" },
    };
    const fetchMock = routedFetch(() =>
      json({ subscriptions: [{ id: "sub-1", status: "canceled" }, pro], count: 2 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { getSubscriptionStatus } = await load();

    await expect(getSubscriptionStatus(CFG, TENANT)).resolves.toEqual({
      active: true,
      subscription: pro,
      plan: pro.plan,
    });

    const [url, init] = commerceCalls(fetchMock)[0];
    expect(url).toBe(`${BASE}/v1/billing/subscriptions`);
    expect(init.headers.Authorization).toBe("Bearer app-token");
    expect(init.headers["X-Org-Id"]).toBe("acme");
  });

  it("is inactive on no plan, and throws on a body without rows", async () => {
    const answers = [json({ subscriptions: [], count: 0 }), json({ count: 0 })];
    vi.stubGlobal(
      "fetch",
      routedFetch(() => answers.shift() as Response),
    );
    const { getSubscriptionStatus } = await load();

    await expect(getSubscriptionStatus(CFG, TENANT, "user-jwt")).resolves.toEqual({
      active: false,
      subscription: null,
      plan: null,
    });
    await expect(getSubscriptionStatus(CFG, { ...TENANT, orgId: "other" })).rejects.toThrow(
      /subscriptions/,
    );
  });
});
