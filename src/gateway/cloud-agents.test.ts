import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchCloudAgentRows, resetCloudAgentsCache } from "./cloud-agents.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function authOf(init: RequestInit | undefined): string | undefined {
  return (init?.headers as Record<string, string> | undefined)?.Authorization;
}

// Env keys the module MUST ignore for auth: there is no pod-fixed credential.
const ENV_KEYS = ["CLOUD_AGENTS_URL", "CLOUD_API_URL", "CLOUD_AGENTS_TOKEN", "HANZO_API_KEY"];
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
  resetCloudAgentsCache();
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = savedEnv[key];
    }
  }
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("fetchCloudAgentRows (per-viewer)", () => {
  it("returns [] and makes no request when the viewer has no bearer/org", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    expect(await fetchCloudAgentRows()).toEqual([]);
    expect(await fetchCloudAgentRows({ orgKey: "hanzo" })).toEqual([]); // bearer missing
    expect(await fetchCloudAgentRows({ bearer: "jwt" })).toEqual([]); // org missing

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never falls back to a pod-fixed token — env credentials are ignored", async () => {
    // A misconfigured pod could set these; they must NOT authenticate a read.
    process.env.CLOUD_AGENTS_TOKEN = "pod-fixed-token";
    process.env.HANZO_API_KEY = "pod-node-jwt";
    const fetchMock = vi.fn(async () => jsonResponse({ agents: [{ id: "x", name: "x" }] }));
    vi.stubGlobal("fetch", fetchMock);

    // No per-viewer identity → local-only, cloud not called with any token.
    const rows = await fetchCloudAgentRows({ logger: { warn: vi.fn() } });

    expect(rows).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps the cloud response using the VIEWER's bearer (no client X-Org-Id)", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        agents: [
          { id: "agent_abc", name: "maxpower-assistant", model: "zen4-pro" },
          { id: "agent_def", name: "" }, // empty name falls back to id
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const rows = await fetchCloudAgentRows({ bearer: "hanzo-viewer-jwt", orgKey: "hanzo" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.cloud.hanzo.ai/v1/agents");
    expect(authOf(init)).toBe("Bearer hanzo-viewer-jwt");
    // Org is resolved server-side from the JWT owner claim; we send no X-Org-Id.
    expect((init.headers as Record<string, string>)["X-Org-Id"]).toBeUndefined();
    expect(rows).toEqual([
      {
        id: "agent_abc",
        name: "maxpower-assistant",
        source: "cloud",
        identity: { name: "maxpower-assistant" },
      },
      { id: "agent_def", name: "agent_def", source: "cloud", identity: { name: "agent_def" } },
    ]);
  });

  it("SECURITY: never cross-bleeds — each org gets ITS OWN rows, cache is per-org", async () => {
    // Cloud returns different rows depending on which bearer (org) is presented.
    const rowsForBearer: Record<string, string> = {
      "hanzo-jwt": "hanzo_agent",
      "lux-jwt": "lux_agent",
    };
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const bearer = (authOf(init) ?? "").replace(/^Bearer /, "");
      const id = rowsForBearer[bearer];
      return jsonResponse({ agents: id ? [{ id, name: id }] : [] });
    });
    vi.stubGlobal("fetch", fetchMock);

    const hanzo = await fetchCloudAgentRows({ bearer: "hanzo-jwt", orgKey: "hanzo" });
    const lux = await fetchCloudAgentRows({ bearer: "lux-jwt", orgKey: "lux" });

    expect(hanzo.map((r) => r.id)).toEqual(["hanzo_agent"]);
    expect(lux.map((r) => r.id)).toEqual(["lux_agent"]);

    // The lux viewer must NEVER see hanzo's agent, and vice-versa.
    expect(lux.some((r) => r.id === "hanzo_agent")).toBe(false);
    expect(hanzo.some((r) => r.id === "lux_agent")).toBe(false);

    // Both fetched with their own bearer — no shared/fixed credential.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map(([, init]) => authOf(init as RequestInit))).toEqual([
      "Bearer hanzo-jwt",
      "Bearer lux-jwt",
    ]);

    // A second lux read hits the lux cache entry (not hanzo's) and stays lux-only.
    const luxAgain = await fetchCloudAgentRows({ bearer: "lux-jwt", orgKey: "lux" });
    expect(luxAgain.map((r) => r.id)).toEqual(["lux_agent"]);
    expect(fetchMock).toHaveBeenCalledTimes(2); // served from lux cache
  });

  it("honors CLOUD_AGENTS_URL base override (org-neutral base URL)", async () => {
    process.env.CLOUD_AGENTS_URL = "http://cloud.hanzo.svc:8000/";
    const fetchMock = vi.fn(async () => jsonResponse({ agents: [] }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchCloudAgentRows({ bearer: "jwt", orgKey: "hanzo" });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://cloud.hanzo.svc:8000/v1/agents");
    expect(authOf(init)).toBe("Bearer jwt"); // still the viewer's bearer
  });

  it("degrades to [] (never throws) when the cloud fetch fails", async () => {
    const warn = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );

    const rows = await fetchCloudAgentRows({ bearer: "jwt", orgKey: "hanzo", logger: { warn } });

    expect(rows).toEqual([]);
    expect(warn).toHaveBeenCalledOnce();
  });

  it("degrades a 401/403 (unauthorized) to an empty list", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ error: "unauthorized" }, 403)),
    );

    const rows = await fetchCloudAgentRows({ bearer: "opaque-hk-key", orgKey: "hanzo" });

    expect(rows).toEqual([]);
  });

  it("serves THAT org's last known rows when a later refresh fails", async () => {
    const okThenFail = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ agents: [{ id: "agent_abc", name: "vi" }] }))
      .mockRejectedValueOnce(new Error("network blip"));
    vi.stubGlobal("fetch", okThenFail);

    // Fake only Date so the 30s cache TTL elapses without a real wait; the stale
    // entry must remain to be served on the failing refresh.
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(0);
      const first = await fetchCloudAgentRows({ bearer: "jwt", orgKey: "hanzo" });
      expect(first).toHaveLength(1);

      vi.setSystemTime(31_000); // past the 30s TTL → the next call refetches
      const second = await fetchCloudAgentRows({ bearer: "jwt", orgKey: "hanzo" });
      expect(okThenFail).toHaveBeenCalledTimes(2); // it did refetch
      expect(second).toEqual(first); // last-known rows for this org, not empty
    } finally {
      vi.useRealTimers();
    }
  });

  it("caches within the TTL per org (one request across back-to-back calls)", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ agents: [{ id: "agent_abc", name: "vi" }] }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await fetchCloudAgentRows({ bearer: "jwt", orgKey: "hanzo" });
    await fetchCloudAgentRows({ bearer: "jwt", orgKey: "hanzo" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
