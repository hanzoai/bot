import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchCloudAgentRows, resetCloudAgentsCache } from "./cloud-agents.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

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

describe("fetchCloudAgentRows", () => {
  it("returns [] and makes no request when no cloud credential is present", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const rows = await fetchCloudAgentRows();

    expect(rows).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps the cloud registry response to cloud-tagged agent rows", async () => {
    process.env.HANZO_API_KEY = "jwt-token";
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        agents: [
          { id: "agent_abc", name: "maxpower-assistant", model: "zen4-pro" },
          { id: "agent_def", name: "" }, // empty name falls back to id
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const rows = await fetchCloudAgentRows();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.cloud.hanzo.ai/v1/agents");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer jwt-token");
    // No client X-Org-Id: the org is resolved server-side from the JWT claim.
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

  it("honors CLOUD_AGENTS_URL / CLOUD_AGENTS_TOKEN overrides", async () => {
    process.env.HANZO_API_KEY = "ignored";
    process.env.CLOUD_AGENTS_TOKEN = "svc-token";
    process.env.CLOUD_AGENTS_URL = "http://cloud-api.hanzo.svc.cluster.local:8000/";
    const fetchMock = vi.fn(async () => jsonResponse({ agents: [] }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchCloudAgentRows();

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://cloud-api.hanzo.svc.cluster.local:8000/v1/agents");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer svc-token");
  });

  it("degrades to [] (never throws) when the cloud fetch fails", async () => {
    process.env.HANZO_API_KEY = "jwt-token";
    const warn = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );

    const rows = await fetchCloudAgentRows({ warn });

    expect(rows).toEqual([]);
    expect(warn).toHaveBeenCalledOnce();
  });

  it("degrades to a 401/403 (unauthorized) as an empty list", async () => {
    process.env.HANZO_API_KEY = "opaque-hk-key"; // not a validated principal
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ error: "X-Org-Id required" }, 403)),
    );

    const rows = await fetchCloudAgentRows();

    expect(rows).toEqual([]);
  });

  it("serves the last known rows when a later refresh fails", async () => {
    process.env.HANZO_API_KEY = "jwt-token";
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
      const first = await fetchCloudAgentRows();
      expect(first).toHaveLength(1);

      vi.setSystemTime(31_000); // past the 30s TTL → the next call refetches
      const second = await fetchCloudAgentRows();
      expect(okThenFail).toHaveBeenCalledTimes(2); // it did refetch
      expect(second).toEqual(first); // last-known rows, not an empty degrade
    } finally {
      vi.useRealTimers();
    }
  });

  it("caches within the TTL (one request across back-to-back calls)", async () => {
    process.env.HANZO_API_KEY = "jwt-token";
    const fetchMock = vi.fn(async () =>
      jsonResponse({ agents: [{ id: "agent_abc", name: "vi" }] }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await fetchCloudAgentRows();
    await fetchCloudAgentRows();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
