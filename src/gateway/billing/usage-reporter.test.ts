import { beforeEach, describe, expect, it, vi } from "vitest";

const CFG = { serverUrl: "https://hanzo.id", clientId: "hanzo-bot" };
const TOKEN_URL = "https://hanzo.id/v1/iam/oauth/token";
const USAGE_URL = "http://cloud.hanzo.svc:8000/v1/billing/usage";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** fetch that answers the IAM token endpoint and hands usage posts to `usage`. */
function routedFetch(usage: () => Response = () => json({})) {
  return vi.fn(async (url: string, _init?: RequestInit) =>
    url === TOKEN_URL ? json({ access_token: "app-token", expires_in: 3600 }) : usage(),
  );
}

function usagePosts(fetchMock: ReturnType<typeof routedFetch>) {
  return fetchMock.mock.calls
    .filter(([url]) => url === USAGE_URL)
    .map(([, init]) => ({
      headers: init?.headers as Record<string, string>,
      body: JSON.parse(init?.body as string),
    }));
}

async function load() {
  vi.resetModules();
  return await import("./usage-reporter.js");
}

const TENANT = { orgId: "acme", userId: "acme/user-1" };

beforeEach(() => {
  vi.stubEnv("IAM_CLIENT_ID", "");
  vi.stubEnv("IAM_CLIENT_SECRET", "s3cret");
  vi.stubEnv("COMMERCE_API_URL", "");
});

describe("usage reporter", () => {
  it("posts the act to /v1/billing/usage as the gateway application for the buyer's org", async () => {
    const fetchMock = routedFetch();
    vi.stubGlobal("fetch", fetchMock);
    const { configureUsageReporter, reportUsage, flushUsageQueue } = await load();
    configureUsageReporter(CFG);

    reportUsage({ id: "req-1", tenant: TENANT, model: "claude-sonnet-4", amountCents: 7 });
    await flushUsageQueue();

    const [post] = usagePosts(fetchMock);
    expect(post.headers.Authorization).toBe("Bearer app-token");
    expect(post.headers["X-Org-Id"]).toBe("acme");
    expect(post.headers["Content-Type"]).toBe("application/json");
    expect(post.body).toEqual({
      id: "req-1",
      org: "acme",
      amount: { decimal: "0.07", currency: "usd" },
      model: "claude-sonnet-4",
    });
  });

  it("renders whole cents as an exact USD decimal and names the project", async () => {
    const fetchMock = routedFetch();
    vi.stubGlobal("fetch", fetchMock);
    const { configureUsageReporter, reportUsage, flushUsageQueue } = await load();
    configureUsageReporter(CFG);

    for (const [id, cents] of [
      ["a", 1],
      ["b", 100],
      ["c", 1234],
      ["d", 100005],
    ] as const) {
      reportUsage({ id, tenant: { ...TENANT, projectId: "p1" }, model: "m", amountCents: cents });
    }
    await flushUsageQueue();

    const posts = usagePosts(fetchMock);
    expect(posts.map((p) => p.body.amount.decimal)).toEqual(["0.01", "1.00", "12.34", "1000.05"]);
    expect(posts.every((p) => p.body.project === "p1")).toBe(true);
  });

  it("sends nothing for an amount that is not a positive whole cent", async () => {
    const fetchMock = routedFetch();
    vi.stubGlobal("fetch", fetchMock);
    const { configureUsageReporter, reportUsage, flushUsageQueue } = await load();
    configureUsageReporter(CFG);

    reportUsage({ id: "zero", tenant: TENANT, model: "m", amountCents: 0 });
    reportUsage({ id: "half", tenant: TENANT, model: "m", amountCents: 7.5 });
    await flushUsageQueue();

    expect(usagePosts(fetchMock)).toEqual([]);
  });

  it("does not retry a refusal, and a refused act does not drop the next", async () => {
    const answers = [json({ error: "usage id already records a different amount" }, 409), json({})];
    const fetchMock = routedFetch(() => answers.shift() as Response);
    vi.stubGlobal("fetch", fetchMock);
    const { configureUsageReporter, reportUsage, flushUsageQueue } = await load();
    configureUsageReporter(CFG);

    reportUsage({ id: "dup", tenant: TENANT, model: "m", amountCents: 5 });
    reportUsage({ id: "next", tenant: TENANT, model: "m", amountCents: 5 });
    await flushUsageQueue();

    expect(usagePosts(fetchMock).map((p) => p.body.id)).toEqual(["dup", "next"]);
  });

  it("records nothing until configured", async () => {
    const fetchMock = routedFetch();
    vi.stubGlobal("fetch", fetchMock);
    const { reportUsage, flushUsageQueue } = await load();

    reportUsage({ id: "req-1", tenant: TENANT, model: "m", amountCents: 7 });
    await flushUsageQueue();

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
