import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { cloudSandboxes, SandboxRefused, secureHop } from "./cloud-sandbox.js";

// The client against a server that answers the way cloud's /v1/sandbox does: 201
// with the sandbox on a lease, 200 with {exitCode,stdout,stderr} on an exec, and a
// problem-details body on a refusal. What the test holds is the WIRE — the caller's
// own bearer and org on every request, and nothing of the runtime's.

type Seen = { method: string; url: string; auth?: string; org?: string; body: unknown };

let seen: Seen[] = [];
let answer: (req: IncomingMessage, res: ServerResponse, body: unknown) => void = () => {};
let server: ReturnType<typeof createServer>;
let base = "";

beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const body = raw ? JSON.parse(raw) : undefined;
      seen.push({
        method: req.method ?? "",
        url: req.url ?? "",
        auth: req.headers.authorization,
        org: req.headers["x-org-id"] as string | undefined,
        body,
      });
      answer(req, res, body);
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((r) => server.close(() => r()));
});

beforeEach(() => {
  seen = [];
});

function json(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

const caller = { org: "acme", bearer: "jwt-alice" };

describe("cloud sandbox client", () => {
  it("leases as the caller: the caller's bearer and org, a class and a ttl", async () => {
    answer = (_req, res) => json(res, 201, { id: "m_abc", status: "running", class: "desktop" });
    const id = await cloudSandboxes(base).lease(caller, { cls: "desktop", ttlSec: 1200 });
    expect(id).toBe("m_abc");
    expect(seen).toEqual([
      {
        method: "POST",
        url: "/v1/sandbox",
        auth: "Bearer jwt-alice",
        org: "acme",
        body: { class: "desktop", ttlSec: 1200 },
      },
    ]);
  });

  it("runs an argv and answers the exit code — a non-zero exit is an answer, not an error", async () => {
    answer = (_req, res) => json(res, 200, { exitCode: 2, stdout: "", stderr: "boom" });
    const r = await cloudSandboxes(base).exec(
      caller,
      "m_abc",
      ["dev", "exec", "x"],
      300,
      new AbortController().signal,
    );
    expect(r).toEqual({ exitCode: 2, stdout: "", stderr: "boom" });
    expect(seen[0]).toMatchObject({
      method: "POST",
      url: "/v1/sandbox/m_abc/exec",
      auth: "Bearer jwt-alice",
      body: { argv: ["dev", "exec", "x"], timeoutSec: 300 },
    });
  });

  it("ends the sandbox with a DELETE on its id, escaped", async () => {
    answer = (_req, res) => {
      res.statusCode = 204;
      res.end();
    };
    await cloudSandboxes(base).end(caller, "m_a/b");
    expect(seen[0]).toMatchObject({ method: "DELETE", url: "/v1/sandbox/m_a%2Fb", org: "acme" });
  });

  it("a refusal carries cloud's own reason", async () => {
    answer = (_req, res) =>
      json(res, 429, {
        type: "about:blank",
        status: 429,
        detail: "org already holds 16 live desktop sandboxes (max 16)",
      });
    const err = await cloudSandboxes(base)
      .lease(caller, { cls: "desktop", ttlSec: 600 })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SandboxRefused);
    expect((err as SandboxRefused).status).toBe(429);
    expect((err as Error).message).toContain("org already holds 16 live desktop sandboxes");
  });

  it("a lease answered without an id is an error, never a sandbox", async () => {
    answer = (_req, res) => json(res, 201, { status: "running" });
    await expect(cloudSandboxes(base).lease(caller, { cls: "dev", ttlSec: 600 })).rejects.toThrow(
      /without an id/,
    );
  });

  it("a halt cuts the exec the caller is waiting on", async () => {
    answer = () => {}; // never answers: the bot is still working
    const halt = new AbortController();
    const pending = cloudSandboxes(base).exec(caller, "m_abc", ["dev"], 900, halt.signal);
    await new Promise((r) => setTimeout(r, 20));
    halt.abort();
    await expect(pending).rejects.toThrow();
  });
});

describe("the hop the bearer takes", () => {
  it("is https, or plain http only to a cluster-local host", () => {
    for (const [u, want] of [
      ["https://api.hanzo.ai", true],
      ["https://10.0.0.7:8000", true],
      ["http://cloud.hanzo.svc:8000", true],
      ["http://cloud.hanzo.svc.cluster.local:8000", true],
      ["http://CLOUD.HANZO.SVC.", true],
      ["http://localhost:8000", true],
      ["http://127.0.0.1:8000", true],
      ["http://[::1]:8000", true],
      ["http://api.hanzo.ai", false],
      ["http://10.0.0.7:8000", false],
      ["http://cloud", false],
      ["http://cloud.svc.example.com", false],
      ["http://cloud.hanzo.svc.cluster.local.evil", false],
    ] as const) {
      expect(secureHop(new URL(u)), u).toBe(want);
    }
  });

  it("refuses a public http base before a byte is sent", async () => {
    seen = [];
    await expect(
      cloudSandboxes("http://api.hanzo.test").lease(caller, { cls: "dev", ttlSec: 60 }),
    ).rejects.toThrow(/cleartext/);
    expect(seen).toEqual([]);
  });
});
