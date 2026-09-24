import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import type { NodeRegistry, NodeSession } from "./node-registry.js";

// The screen proxy over a REAL http server and real WebSocket upgrades. A viewer
// is a browser: it can bring an Origin and a ticket and nothing else, so that is
// all these tests send. Tickets are minted by the vnc.ticket RPC handler itself,
// on connections whose identity the test states.

vi.mock("../config/config.js", () => ({
  loadConfig: () => ({ gateway: { auth: { mode: "iam" } } }),
}));

const { createVncProxy, vncHandlers, vncViewerHtml } = await import("./server-methods/vnc.js");
const { mayWatch, mintVncTicket, redeemVncTicket } = await import("./vnc-tickets.js");

const ALLOWED = "https://gw.hanzo.bot";

type Invoke = { nodeId: string; command: string; params: { tunnelId: string; tunnelUrl: string } };

function node(nodeId: string, owner?: string): NodeSession {
  return {
    nodeId,
    connId: `c-${nodeId}`,
    client: owner
      ? ({ identity: { orgId: owner, owner, bearer: "b", method: "iam" } } as never)
      : ({} as never),
    caps: [],
    commands: ["vnc.tunnel.open"],
    connectedAtMs: 0,
  };
}

let nodes = new Map<string, NodeSession>();
let invokes: Invoke[] = [];
const registry = {
  get: (id: string) => nodes.get(id),
  listConnected: () => [...nodes.values()],
  size: 0,
  invoke: async (p: Invoke) => {
    invokes.push(p);
    return { ok: true };
  },
} as unknown as NodeRegistry;

let multiTenant = true;
let server: ReturnType<typeof createServer>;
let port = 0;
let proxy: ReturnType<typeof createVncProxy>;

beforeAll(async () => {
  proxy = createVncProxy({
    getNodeRegistry: () => registry,
    multiTenant: () => multiTenant,
    originAllowed: (req: IncomingMessage) => req.headers.origin === ALLOWED,
    vncHost: "127.0.0.1",
    vncPort: 1, // nothing listens: the gateway's own screen is refused by the OS
  });
  server = createServer((_req, res) => res.end());
  server.on("upgrade", (req, socket, head) => {
    if (!proxy.handleTunnelUpgrade(req, socket, head) && !proxy.handleUpgrade(req, socket, head)) {
      socket.destroy();
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  proxy.close();
  server.closeAllConnections();
  await new Promise<void>((r) => server.close(() => r()));
});

beforeEach(() => {
  multiTenant = true;
  nodes = new Map([
    ["acme-mac", node("acme-mac", "acme")],
    ["globex-mac", node("globex-mac", "globex")],
    ["shared-pod", node("shared-pod")],
  ]);
  invokes = [];
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** What vnc.ticket answers a connection with this owner (null: no IAM identity). */
function ticketFor(owner: string | null, nodeId?: string) {
  let answer: {
    ok: boolean;
    payload?: { ticket: string; viewer: string };
    error?: { message: string };
  } = {
    ok: false,
  };
  void vncHandlers["vnc.ticket"]({
    req: {} as never,
    params: nodeId === undefined ? {} : { nodeId },
    client: owner
      ? ({ identity: { orgId: owner, owner, bearer: "b", method: "iam" } } as never)
      : null,
    isWebchatConnect: () => false,
    respond: (ok, payload, error) => {
      answer = { ok, payload: payload as never, error };
    },
    context: { nodeRegistry: registry, logGateway: { info: () => {} } } as never,
  });
  return answer;
}

/** Open /vnc as a browser would, and report how the upgrade was answered. */
function open(
  query: string,
  origin: string | null = ALLOWED,
): Promise<{ status: number; ws?: WebSocket }> {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/vnc${query}`, {
      headers: origin ? { origin } : {},
    });
    ws.on("unexpected-response", (_req, res) => {
      resolve({ status: res.statusCode ?? 0 });
      ws.terminate();
    });
    ws.on("open", () => resolve({ status: 101, ws }));
    ws.on("error", () => {});
  });
}

async function until(cond: () => boolean, ms = 2000) {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) {
      throw new Error("condition not met in time");
    }
    await new Promise((r) => setTimeout(r, 5));
  }
}

describe("/vnc upgrade", () => {
  it("anonymous — no ticket — is refused, and no node is contacted", async () => {
    expect((await open("?nodeId=acme-mac")).status).toBe(401);
    expect((await open("")).status).toBe(401);
    expect(invokes).toEqual([]);
  });

  it("a forged or altered ticket is refused", async () => {
    const t = ticketFor("acme", "acme-mac").payload!.ticket;
    const [body, mac] = t.split(".");
    const forged = Buffer.from(
      JSON.stringify({ org: "acme", nodeId: "globex-mac", exp: Date.now() + 60_000, jti: "x" }),
    ).toString("base64url");
    expect((await open(`?ticket=${forged}.${mac}`)).status).toBe(401);
    expect((await open(`?ticket=${body}.AAAA`)).status).toBe(401);
    expect(invokes).toEqual([]);
  });

  it("the owner opens their own node's screen, and the ticket is spent by it", async () => {
    const minted = ticketFor("acme", "acme-mac");
    expect(minted.ok).toBe(true);
    const first = await open(`?ticket=${encodeURIComponent(minted.payload!.ticket)}`);
    expect(first.status).toBe(101);
    await until(() => invokes.length === 1);
    expect(invokes[0]).toMatchObject({ nodeId: "acme-mac", command: "vnc.tunnel.open" });
    first.ws!.close();
    // Replayed: refused.
    expect((await open(`?ticket=${encodeURIComponent(minted.payload!.ticket)}`)).status).toBe(401);
  });

  it("a query naming another node cannot redirect a ticket", async () => {
    const t = ticketFor("acme", "acme-mac").payload!.ticket;
    const r = await open(`?ticket=${encodeURIComponent(t)}&nodeId=globex-mac`);
    expect(r.status).toBe(101);
    await until(() => invokes.length === 1);
    expect(invokes[0].nodeId).toBe("acme-mac");
    r.ws!.close();
  });

  it("refuses a page on another origin, and a request with no origin, even with a good ticket", async () => {
    for (const origin of ["https://evil.example", null]) {
      const t = ticketFor("acme", "acme-mac").payload!.ticket;
      expect((await open(`?ticket=${encodeURIComponent(t)}`, origin)).status).toBe(403);
    }
    expect(invokes).toEqual([]);
  });

  it("a ticket stops opening a node that has since changed hands", async () => {
    const t = ticketFor("acme", "acme-mac").payload!.ticket;
    nodes.set("acme-mac", node("acme-mac", "globex"));
    expect((await open(`?ticket=${encodeURIComponent(t)}`)).status).toBe(401);
    expect(invokes).toEqual([]);
  });

  it("a ticket from a single-owner gateway opens nothing once the gateway is multi-tenant", async () => {
    multiTenant = false;
    const t = mintVncTicket({ org: "", nodeId: "acme-mac" });
    multiTenant = true;
    expect((await open(`?ticket=${encodeURIComponent(t)}`)).status).toBe(401);
  });
});

describe("vnc.ticket", () => {
  it("another org's node is not found — the same answer as no node at all", () => {
    for (const nodeId of ["globex-mac", "no-such-node"]) {
      const r = ticketFor("acme", nodeId);
      expect(r.ok).toBe(false);
      expect(r.error!.message).toBe("no such node for this org");
    }
  });

  it("a node no tenant owns is watched by no tenant", () => {
    expect(ticketFor("acme", "shared-pod").ok).toBe(false);
  });

  it("an IAM gateway mints nothing for a connection without a hanzo.id session", () => {
    const r = ticketFor(null, "acme-mac");
    expect(r.ok).toBe(false);
    expect(r.error!.message).toContain("hanzo.id");
  });

  it("the gateway's own screen is a SuperAdmin's, and no tenant's", () => {
    expect(ticketFor("acme").ok).toBe(false);
    expect(ticketFor("acme-admins").ok).toBe(false);
    const admin = ticketFor("admin");
    expect(admin.ok).toBe(true);
    expect(redeemVncTicket(admin.payload!.ticket)).toEqual({ org: "admin", nodeId: null });
  });

  it("answers a viewer path carrying the ticket", () => {
    const r = ticketFor("acme", "acme-mac");
    expect(r.payload!.viewer).toMatch(/^\/vnc-viewer\?ticket=/);
  });

  it("refuses a malformed node id", () => {
    expect(ticketFor("acme", "   ").ok).toBe(false);
  });
});

describe("mayWatch on a single-owner gateway", () => {
  it("the authenticated operator may watch any connected node and the gateway's own screen", () => {
    const reg = { get: (id: string) => nodes.get(id) };
    expect(
      mayWatch({ client: null, nodeId: "shared-pod", registry: reg, multiTenant: false }),
    ).toEqual({
      ok: true,
      target: { org: "", nodeId: "shared-pod" },
    });
    expect(mayWatch({ client: null, nodeId: null, registry: reg, multiTenant: false }).ok).toBe(
      true,
    );
    expect(mayWatch({ client: null, nodeId: "gone", registry: reg, multiTenant: false }).ok).toBe(
      false,
    );
  });
});

describe("/vnc-tunnel", () => {
  it("refuses a caller that sends an Origin: the callback is a node's, never a page's", async () => {
    const status = await new Promise<number>((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/vnc-tunnel?tunnelId=x.y`, {
        headers: { origin: ALLOWED },
      });
      ws.on("unexpected-response", (_req, res) => {
        resolve(res.statusCode ?? 0);
        ws.terminate();
      });
      ws.on("open", () => resolve(101));
      ws.on("error", () => {});
    });
    expect(status).toBe(403);
  });
});

describe("vnc-viewer page", () => {
  it("embeds the ticket as data, so a crafted one cannot break out of the script", () => {
    const html = vncViewerHtml("https://gw.hanzo.bot", '"</script><script>alert(1)</script>');
    expect(html).not.toContain("</script><script>alert(1)");
    expect(html).toContain("wss://gw.hanzo.bot/vnc?ticket=");
  });
});
