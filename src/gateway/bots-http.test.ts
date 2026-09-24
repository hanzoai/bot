import fs from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Bus } from "../infra/bus.js";
import type { GatewayAuthResult } from "./auth.js";
import type { SandboxCaller, Sandboxes } from "./cloud-sandbox.js";

// The run surface over a REAL tenant store on disk and a fake sandbox whose every
// answer the test decides. Status is asserted through GET /v1/bots — the same read
// cloud makes — so a transition that was emitted but never recorded fails here.

let gate: GatewayAuthResult = { ok: true };
vi.mock("./auth.js", () => ({
  authorizeHttpGatewayConnect: async () => gate,
}));
vi.mock("../config/config.js", () => ({ loadConfig: () => ({}) }));

const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "bot-runs-"));
process.env.BOT_STATE_DIR = stateDir;

const { handleBotsHttpRequest } = await import("./bots-http.js");
const { BotRuns, MAX_LIVE_RUNS_PER_ORG } = await import("./bot-runs.js");
const { TOOLS } = await import("./coding-task.js");
const { updateSessionStore } = await import("../config/sessions.js");

type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void };
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

type Exec = {
  caller: SandboxCaller;
  id: string;
  argv: string[];
  timeoutSec: number;
  signal: AbortSignal;
};

// A sandbox provider under the test's hand: each lease and each exec waits for the
// test to answer it, so every intermediate state is observable.
function fakeSandboxes() {
  const leases: Array<{
    caller: SandboxCaller;
    cls: string;
    ttlSec: number;
    answer: Deferred<string>;
  }> = [];
  const execs: Array<
    Exec & { answer: Deferred<{ exitCode: number; stdout: string; stderr: string }> }
  > = [];
  const ends: Array<{ caller: SandboxCaller; id: string }> = [];
  const log: string[] = [];
  const sandboxes: Sandboxes = {
    lease(caller, spec) {
      const answer = deferred<string>();
      leases.push({ caller, cls: spec.cls, ttlSec: spec.ttlSec, answer });
      return answer.promise;
    },
    exec(caller, id, argv, timeoutSec, signal) {
      const answer = deferred<{ exitCode: number; stdout: string; stderr: string }>();
      signal.addEventListener("abort", () => answer.reject(new Error("aborted")));
      execs.push({ caller, id, argv, timeoutSec, signal, answer });
      return answer.promise;
    },
    async end(caller, id) {
      ends.push({ caller, id });
      log.push(`end ${id}`);
    },
  };
  return { sandboxes, leases, execs, ends, log };
}

function fakeBus(log: string[]) {
  const pubs: Array<{ subject: string; payload: Record<string, unknown> }> = [];
  const bus: Bus = {
    publish(subject, payload) {
      pubs.push({ subject, payload: payload as Record<string, unknown> });
      log.push(`pub ${subject}`);
    },
    async close() {},
  };
  return { bus, pubs };
}

let server: ReturnType<typeof createServer>;
let port = 0;
let sb = fakeSandboxes();
let bus = fakeBus(sb.log);
let runs = new BotRuns({ sandboxes: sb.sandboxes, bus: bus.bus });

beforeAll(async () => {
  server = createServer((req, res) => {
    void handleBotsHttpRequest(req, res, { auth: { mode: "iam" } as never, runs }).then(
      (handled) => {
        if (!handled) {
          res.statusCode = 404;
          res.end("not found");
        }
      },
    );
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  fs.rmSync(stateDir, { recursive: true, force: true });
});

beforeEach(() => {
  fs.rmSync(path.join(stateDir, "tenants"), { recursive: true, force: true });
  sb = fakeSandboxes();
  bus = fakeBus(sb.log);
  runs = new BotRuns({ sandboxes: sb.sandboxes, bus: bus.bus });
  signIn("acme");
});

afterEach(async () => {
  // Let every driver finish so no run leaks into the next test.
  for (const l of sb.leases) {
    l.answer.reject(new Error("test over"));
  }
  for (const e of sb.execs) {
    e.answer.reject(new Error("test over"));
  }
  await runs.settled();
});

/** The caller presented an IAM token whose owner is `org`. */
function signIn(org: string, current = org) {
  gate = {
    ok: true,
    method: "iam",
    user: `u-${org}`,
    orgId: current,
    owner: org,
    bearer: `jwt-${org}`,
  };
}

async function req(
  method: string,
  p: string,
  body?: unknown,
  headers: Record<string, string> = {},
) {
  const res = await fetch(`http://127.0.0.1:${port}${p}`, {
    method,
    headers: { "content-type": "application/json", authorization: "Bearer x", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  // oxlint-disable-next-line typescript/no-explicit-any -- a test reads arbitrary answers
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.status, json, text, allow: res.headers.get("allow") };
}

async function list(headers: Record<string, string> = {}) {
  const r = await req("GET", "/v1/bots", undefined, headers);
  expect(r.status).toBe(200);
  return r.json.bots as Array<Record<string, unknown>>;
}

async function until(cond: () => boolean | Promise<boolean>, ms = 3000) {
  const end = Date.now() + ms;
  while (!(await cond())) {
    if (Date.now() > end) {
      throw new Error("condition not met in time");
    }
    await new Promise((r) => setTimeout(r, 5));
  }
}

async function statusOf(runId: string, headers: Record<string, string> = {}) {
  return (await list(headers)).find((b) => b.runId === runId)?.status;
}

describe("POST /v1/bots — launch", () => {
  it("records the run as booting and answers before the sandbox exists", async () => {
    const r = await req("POST", "/v1/bots", { task: "book a flight", surface: "desktop" });
    expect(r.status).toBe(201);
    expect(r.json).toMatchObject({
      bot: "main",
      task: "book a flight",
      surface: "desktop",
      status: "booting",
    });
    expect(r.json.runId).toMatch(/^run_[0-9a-f]{32}$/);
    // The lease is asked and not yet answered, and the list already holds the run.
    expect(sb.leases).toHaveLength(1);
    expect(await statusOf(r.json.runId)).toBe("booting");
  });

  it("walks booting → running → succeeded from the run's own events, and says so on the bus", async () => {
    const r = await req("POST", "/v1/bots", { task: "summarise my inbox", surface: "terminal" });
    const runId = r.json.runId as string;
    sb.leases[0].answer.resolve("m_box1");
    await until(async () => (await statusOf(runId)) === "running");
    const running = (await list()).find((b) => b.runId === runId)!;
    expect(running.sandboxId).toBe("m_box1");

    await until(() => sb.execs.length === 1);
    sb.execs[0].answer.resolve({ exitCode: 0, stdout: "done", stderr: "" });
    await until(async () => (await statusOf(runId)) === "succeeded");
    // The record is written before the event is published; wait for the driver.
    await runs.settled();
    const done = (await list()).find((b) => b.runId === runId)!;
    expect(done).toMatchObject({ exitCode: 0, sandboxId: "m_box1" });
    expect(done.endedAt).toBeTypeOf("string");

    expect(bus.pubs.map((p) => p.subject)).toEqual([
      "bot.run.booting",
      "bot.run.running",
      "bot.run.succeeded",
    ]);
    // The sandbox is released BEFORE the terminal event: succeeded means gone.
    expect(sb.log.indexOf("end m_box1")).toBeLessThan(sb.log.indexOf("pub bot.run.succeeded"));
    for (const p of bus.pubs) {
      expect(p.payload).toMatchObject({ org: "acme", runId, bot: "main", surface: "terminal" });
      // The tenant's words stay in the tenant's record, off the cluster-wide bus.
      expect(p.payload).not.toHaveProperty("task");
      expect(p.payload).not.toHaveProperty("error");
    }
  });

  it("leases as the caller, in the caller's org, and runs the runtime's bot in it", async () => {
    signIn("acme");
    const r = await req("POST", "/v1/bots", {
      task: "fix the flaky test",
      surface: "desktop",
      timeoutSeconds: 120,
    });
    expect(r.status).toBe(201);
    expect(sb.leases[0]).toMatchObject({
      caller: { org: "acme", bearer: "jwt-acme" },
      cls: "desktop",
      ttlSec: 420,
    });
    sb.leases[0].answer.resolve("m_1");
    await until(() => sb.execs.length === 1);
    expect(sb.execs[0]).toMatchObject({
      caller: { org: "acme", bearer: "jwt-acme" },
      id: "m_1",
      argv: TOOLS.dev("fix the flaky test"),
      timeoutSec: 120,
    });
  });

  it("a terminal run leases the class without a screen", async () => {
    await req("POST", "/v1/bots", { task: "t", surface: "terminal" });
    expect(sb.leases[0].cls).toBe("dev");
  });

  it("records a failing bot as failed with its reason, and keeps the reason off the bus", async () => {
    const r = await req("POST", "/v1/bots", { task: "t" });
    sb.leases[0].answer.resolve("m_2");
    await until(() => sb.execs.length === 1);
    sb.execs[0].answer.resolve({ exitCode: 3, stdout: "", stderr: "model refused" });
    await until(async () => (await statusOf(r.json.runId)) === "failed");
    await runs.settled();
    const row = (await list()).find((b) => b.runId === r.json.runId)!;
    expect(row).toMatchObject({ exitCode: 3, error: "model refused" });
    expect(sb.ends).toEqual([{ caller: { org: "acme", bearer: "jwt-acme" }, id: "m_2" }]);
    expect(bus.pubs.at(-1)).toMatchObject({ subject: "bot.run.failed", payload: { exitCode: 3 } });
    expect(bus.pubs.at(-1)!.payload).not.toHaveProperty("error");
  });

  it("a refused lease fails the run with cloud's reason and releases nothing", async () => {
    const r = await req("POST", "/v1/bots", { task: "t" });
    sb.leases[0].answer.reject(new Error("sandbox lease refused (402): insufficient balance"));
    await until(async () => (await statusOf(r.json.runId)) === "failed");
    await runs.settled();
    const row = (await list()).find((b) => b.runId === r.json.runId)!;
    expect(row.error).toContain("insufficient balance");
    expect(sb.ends).toEqual([]);
    expect(bus.pubs.map((p) => p.subject)).toEqual(["bot.run.booting", "bot.run.failed"]);
  });

  it("refuses a caller that did not present its own IAM token — the service bearer included", async () => {
    for (const g of [
      { ok: true, method: "token" },
      { ok: true, method: "none" },
      { ok: true, method: "iam", orgId: "acme", owner: "acme" }, // no bearer retained
    ] as GatewayAuthResult[]) {
      gate = g;
      const r = await req("POST", "/v1/bots", { task: "t" }, { "x-org-id": "acme" });
      expect(r.status).toBe(401);
    }
    expect(sb.leases).toEqual([]);
    expect(bus.pubs).toEqual([]);
  });

  it("a signed-in caller cannot launch into an org its token does not name", async () => {
    signIn("globex");
    const r = await req("POST", "/v1/bots", { task: "t" }, { "x-org-id": "acme" });
    expect(r.status).toBe(403);
    expect(sb.leases).toEqual([]);
    signIn("acme");
    expect(await list()).toEqual([]);
  });

  it("acts in the token's owner org — never in a claim beside it", async () => {
    // The gate's current org can be the first of the token's groups; a group is
    // not an org, and only `owner` is cloud's scoping key.
    signIn("acme", "acme-admins");
    const r = await req("POST", "/v1/bots", { task: "t" });
    expect(r.status).toBe(201);
    expect(sb.leases[0].caller.org).toBe("acme");
    expect(
      (await req("POST", "/v1/bots", { task: "t" }, { "x-org-id": "acme-admins" })).status,
    ).toBe(403);
    expect((await req("POST", "/v1/bots", { task: "t" }, { "x-org-id": "acme" })).status).toBe(201);
  });

  it("validates the launch before anything is recorded or leased", async () => {
    for (const body of [
      {},
      { task: "   " },
      { task: "t", surface: "phone" },
      { task: "t", bot: "../other-org" },
      { task: "t", bot: 7 },
      { task: "t", timeoutSeconds: 5 },
      { task: "t", timeoutSeconds: 901 },
      { task: "t", timeoutSeconds: 90.5 },
      { task: "x".repeat(32 * 1024 + 1) },
      [],
    ]) {
      const r = await req("POST", "/v1/bots", body);
      expect(r.status, JSON.stringify(body).slice(0, 60)).toBe(400);
      expect(typeof r.json.error).toBe("string");
    }
    expect(sb.leases).toEqual([]);
    expect(await list()).toEqual([]);
  });

  it("files a run under the named bot, lower-cased", async () => {
    const r = await req("POST", "/v1/bots", { task: "t", bot: "Concierge" });
    expect(r.json.bot).toBe("concierge");
    expect(
      fs.existsSync(path.join(stateDir, "tenants", "acme", "agents", "concierge", "sessions")),
    ).toBe(true);
  });

  it("answers 429 past the org's live-run ceiling, before leasing", async () => {
    for (let i = 0; i < MAX_LIVE_RUNS_PER_ORG; i++) {
      expect((await req("POST", "/v1/bots", { task: `t${i}` })).status).toBe(201);
    }
    const r = await req("POST", "/v1/bots", { task: "one more" });
    expect(r.status).toBe(429);
    expect(sb.leases).toHaveLength(MAX_LIVE_RUNS_PER_ORG);
    // Another org is not charged for acme's runs.
    signIn("globex");
    expect((await req("POST", "/v1/bots", { task: "t" })).status).toBe(201);
  });

  it("with no bus it refuses to launch — a run is not started unannounced — and still lists", async () => {
    runs = new BotRuns({
      sandboxes: sb.sandboxes,
      bus: null,
      busMissing: "no bus: PUBSUB_URL is unset",
    });
    const r = await req("POST", "/v1/bots", { task: "t" });
    expect(r.status).toBe(503);
    expect(r.json.error).toContain("PUBSUB_URL");
    expect(sb.leases).toEqual([]);
    expect(await list()).toEqual([]);
  });
});

describe("POST /v1/bots/:runId/stop", () => {
  it("halts a running bot, releases its sandbox, and removes it", async () => {
    const r = await req("POST", "/v1/bots", { task: "t" });
    const runId = r.json.runId as string;
    sb.leases[0].answer.resolve("m_3");
    await until(() => sb.execs.length === 1);

    const s = await req("POST", `/v1/bots/${runId}/stop`);
    expect(s.status).toBe(200);
    expect(s.json).toEqual({ runId, status: "stopped" });
    expect(sb.execs[0].signal.aborted).toBe(true);
    await until(() => bus.pubs.some((p) => p.subject === "bot.run.stopped"));
    expect(sb.ends.map((e) => e.id)).toEqual(["m_3"]);
    expect(sb.log.indexOf("end m_3")).toBeLessThan(sb.log.indexOf("pub bot.run.stopped"));
    expect(await list()).toEqual([]);
  });

  it("stopped while booting: the sandbox that arrives is released at once and never runs", async () => {
    const r = await req("POST", "/v1/bots", { task: "t" });
    const runId = r.json.runId as string;
    expect((await req("POST", `/v1/bots/${runId}/stop`)).status).toBe(200);
    sb.leases[0].answer.resolve("m_late");
    await until(() => bus.pubs.some((p) => p.subject === "bot.run.stopped"));
    expect(sb.execs).toEqual([]);
    expect(sb.ends.map((e) => e.id)).toEqual(["m_late"]);
    expect(bus.pubs.map((p) => p.subject)).toEqual(["bot.run.booting", "bot.run.stopped"]);
    // The driver's last word does not bring a removed run back.
    expect(await list()).toEqual([]);
  });

  it("one org cannot stop, or see, another org's run", async () => {
    const r = await req("POST", "/v1/bots", { task: "acme secret" });
    const runId = r.json.runId as string;
    sb.leases[0].answer.resolve("m_4");
    await until(async () => (await statusOf(runId)) === "running");

    signIn("globex");
    expect((await req("POST", `/v1/bots/${runId}/stop`)).status).toBe(404);
    expect(await list()).toEqual([]);
    // Naming acme in the header does not help a globex token.
    expect(
      (await req("POST", `/v1/bots/${runId}/stop`, undefined, { "x-org-id": "acme" })).status,
    ).toBe(404);
    expect(await list({ "x-org-id": "acme" })).toEqual([]);

    signIn("acme");
    expect(await statusOf(runId)).toBe("running");
    expect(sb.execs[0].signal.aborted).toBe(false);
  });

  it("the service bearer acts in the org cloud names", async () => {
    const r = await req("POST", "/v1/bots", { task: "t" });
    gate = { ok: true, method: "token" };
    expect(await list({ "x-org-id": "acme" })).toHaveLength(1);
    expect(await list({ "x-org-id": "globex" })).toEqual([]);
    expect(
      (await req("POST", `/v1/bots/${r.json.runId}/stop`, undefined, { "x-org-id": "acme" }))
        .status,
    ).toBe(200);
  });

  it("an unknown id, a reserved key and a prototype name are all absent", async () => {
    for (const id of ["run_nope", "global", "__proto__", "constructor"]) {
      expect((await req("POST", `/v1/bots/${id}/stop`)).status).toBe(404);
    }
  });
});

describe("GET /v1/bots", () => {
  it("reports a live run nobody in this process drives as lost", async () => {
    const storePath = path.join(
      stateDir,
      "tenants",
      "acme",
      "agents",
      "main",
      "sessions",
      "sessions.json",
    );
    await updateSessionStore(storePath, (store) => {
      store.run_orphan = {
        sessionId: "run_orphan",
        updatedAt: 1,
        label: "left behind",
        origin: { provider: "bot", surface: "desktop" },
        run: {
          bot: "main",
          status: "running",
          boot: "a-previous-process",
          startedAt: 1,
          sandboxId: "m_old",
        },
      };
      store.run_done = {
        sessionId: "run_done",
        updatedAt: 1,
        label: "finished",
        origin: { provider: "bot", surface: "terminal" },
        run: {
          bot: "main",
          status: "succeeded",
          boot: "a-previous-process",
          startedAt: 1,
          endedAt: 2,
          exitCode: 0,
        },
      };
    });
    const rows = await list();
    expect(rows.find((b) => b.runId === "run_orphan")?.status).toBe("lost");
    // A finished run is finished whoever drove it.
    expect(rows.find((b) => b.runId === "run_done")?.status).toBe("succeeded");
  });

  it("lists nothing for a caller with no tenant", async () => {
    await req("POST", "/v1/bots", { task: "t" });
    gate = { ok: true, method: "none" };
    expect(await list({ "x-org-id": "acme" })).toEqual([]);
  });

  it("answers 405 with the methods the collection serves", async () => {
    const r = await req("PUT", "/v1/bots", {});
    expect(r.status).toBe(405);
    expect(r.allow).toBe("GET, POST");
  });
});
