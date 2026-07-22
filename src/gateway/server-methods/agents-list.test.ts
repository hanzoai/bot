import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GatewayAgentRow } from "../../shared/session-types.js";

/* ------------------------------------------------------------------ */
/* Mocks                                                              */
/* ------------------------------------------------------------------ */

const mocks = vi.hoisted(() => ({
  loadConfigReturn: {} as Record<string, unknown>,
  listAgentsForGateway: vi.fn(() => ({
    defaultId: "main",
    mainKey: "agent:main:main",
    scope: "global" as const,
    agents: [] as GatewayAgentRow[],
  })),
  fetchCloudAgentRows: vi.fn(
    async (_params?: { bearer?: string; orgKey?: string }) => [] as GatewayAgentRow[],
  ),
  listConnected: vi.fn(() => [] as Array<{ nodeId: string; displayName?: string }>),
}));

vi.mock("../../config/config.js", () => ({
  loadConfig: () => mocks.loadConfigReturn,
  writeConfigFile: vi.fn(async () => {}),
}));

vi.mock("../session-utils.js", () => ({
  listAgentsForGateway: mocks.listAgentsForGateway,
}));

vi.mock("../cloud-agents.js", () => ({
  fetchCloudAgentRows: mocks.fetchCloudAgentRows,
}));

/* ------------------------------------------------------------------ */
/* Import after mocks are set up                                      */
/* ------------------------------------------------------------------ */

const { agentsHandlers } = await import("./agents.js");

type Identity = { orgId: string; bearer: string; method: "iam" };

function callList(identity?: Identity) {
  const respond = vi.fn();
  const warn = vi.fn();
  const client = identity ? ({ connect: { role: "operator" }, identity } as never) : null;
  const promise = agentsHandlers["agents.list"]({
    params: {},
    respond,
    context: {
      nodeRegistry: { listConnected: mocks.listConnected },
      logGateway: { warn },
    } as never,
    req: { type: "req" as const, id: "1", method: "agents.list" },
    client,
    isWebchatConnect: () => false,
  });
  return { respond, warn, promise };
}

function localRows(...ids: string[]): GatewayAgentRow[] {
  return ids.map((id) => ({ id, name: id }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listAgentsForGateway.mockReturnValue({
    defaultId: "main",
    mainKey: "agent:main:main",
    scope: "global",
    agents: localRows("main", "vi"),
  });
  mocks.fetchCloudAgentRows.mockResolvedValue([]);
  mocks.listConnected.mockReturnValue([]);
});

describe("agents.list read-through", () => {
  it("merges cloud registry agents with local config agents, tagging source", async () => {
    mocks.fetchCloudAgentRows.mockResolvedValue([
      {
        id: "agent_max",
        name: "maxpower-assistant",
        source: "cloud",
        identity: { name: "maxpower-assistant" },
      },
    ]);

    const { respond, promise } = callList();
    await promise;

    const [ok, result] = respond.mock.calls[0] as [boolean, { agents: GatewayAgentRow[] }];
    expect(ok).toBe(true);
    const byId = new Map(result.agents.map((a) => [a.id, a]));
    expect(byId.get("main")?.source).toBe("local");
    expect(byId.get("vi")?.source).toBe("local");
    expect(byId.get("agent_max")?.source).toBe("cloud");
    expect(byId.get("agent_max")?.name).toBe("maxpower-assistant");
    expect(result.agents).toHaveLength(3);
  });

  it("dedups by id — a live runtime node wins over its cloud definition", async () => {
    mocks.listConnected.mockReturnValue([{ nodeId: "agent_max", displayName: "Max (live)" }]);
    mocks.fetchCloudAgentRows.mockResolvedValue([
      {
        id: "agent_max",
        name: "maxpower-assistant",
        source: "cloud",
        identity: { name: "maxpower-assistant" },
      },
    ]);

    const { respond, promise } = callList();
    await promise;

    const [, result] = respond.mock.calls[0] as [boolean, { agents: GatewayAgentRow[] }];
    const maxRows = result.agents.filter((a) => a.id === "agent_max");
    expect(maxRows).toHaveLength(1);
    expect(maxRows[0]?.source).toBe("node");
    expect(maxRows[0]?.name).toBe("Max (live)");
  });

  it("degrades to the local list when the cloud read-through yields nothing", async () => {
    mocks.fetchCloudAgentRows.mockResolvedValue([]);

    const { respond, promise } = callList();
    await promise;

    const [ok, result] = respond.mock.calls[0] as [boolean, { agents: GatewayAgentRow[] }];
    expect(ok).toBe(true);
    expect(result.agents.map((a) => a.id)).toEqual(["main", "vi"]);
    expect(result.agents.every((a) => a.source === "local")).toBe(true);
  });

  it("scopes the read-through to the viewer's own bearer + org", async () => {
    const { promise } = callList({ orgId: "hanzo", bearer: "hanzo-jwt", method: "iam" });
    await promise;

    expect(mocks.fetchCloudAgentRows).toHaveBeenCalledTimes(1);
    const arg = mocks.fetchCloudAgentRows.mock.calls[0]?.[0] ?? {};
    expect(arg.bearer).toBe("hanzo-jwt");
    expect(arg.orgKey).toBe("hanzo");
  });

  it("passes NO bearer/org for a non-IAM viewer (shared-token / null identity)", async () => {
    const { promise } = callList(); // client: null → no identity
    await promise;

    expect(mocks.fetchCloudAgentRows).toHaveBeenCalledTimes(1);
    const arg = mocks.fetchCloudAgentRows.mock.calls[0]?.[0] ?? {};
    expect(arg.bearer).toBeUndefined();
    expect(arg.orgKey).toBeUndefined();
  });

  it("SECURITY: a lux viewer never sees a hanzo viewer's cloud agents", async () => {
    // Fresh local result per call — the real handler builds one per request; a
    // shared mock object would be mutated across both viewers and mask leaks.
    mocks.listAgentsForGateway.mockImplementation(() => ({
      defaultId: "main",
      mainKey: "agent:main:main",
      scope: "global" as const,
      agents: localRows("main", "vi"),
    }));
    // The read-through resolves rows per viewer bearer/org (as cloud-agents does).
    mocks.fetchCloudAgentRows.mockImplementation(
      async (arg?: { orgKey?: string }): Promise<GatewayAgentRow[]> => {
        if (arg?.orgKey === "hanzo") {
          return [{ id: "hanzo_bot", name: "Hanzo Bot", source: "cloud" }];
        }
        if (arg?.orgKey === "lux") {
          return [{ id: "lux_bot", name: "Lux Bot", source: "cloud" }];
        }
        return [];
      },
    );

    const hanzo = callList({ orgId: "hanzo", bearer: "hanzo-jwt", method: "iam" });
    await hanzo.promise;
    const lux = callList({ orgId: "lux", bearer: "lux-jwt", method: "iam" });
    await lux.promise;

    const hanzoAgents = (hanzo.respond.mock.calls[0][1] as { agents: GatewayAgentRow[] }).agents;
    const luxAgents = (lux.respond.mock.calls[0][1] as { agents: GatewayAgentRow[] }).agents;

    expect(hanzoAgents.map((a) => a.id)).toContain("hanzo_bot");
    expect(hanzoAgents.some((a) => a.id === "lux_bot")).toBe(false);
    expect(luxAgents.map((a) => a.id)).toContain("lux_bot");
    expect(luxAgents.some((a) => a.id === "hanzo_bot")).toBe(false);
  });
});
