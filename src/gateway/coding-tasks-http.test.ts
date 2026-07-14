import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { CodingEvent, CodingRuntime } from "./coding-task.js";

// Mock the pod-boundary auth to pass and config to be empty, so this test isolates
// the handler's OWN concerns: auth-mode gate, host pin + org-match isolation, body
// validation, concurrency cap, and NDJSON streaming.
vi.mock("./auth.js", () => ({
  authorizeHttpGatewayConnect: async () => ({ ok: true }),
}));
vi.mock("../config/config.js", () => ({ loadConfig: () => ({}) }));
vi.mock("../logger.js", () => ({ logWarn: () => {}, logInfo: () => {}, logError: () => {} }));

const { handleCodingTasksHttpRequest } = await import("./coding-tasks-http.js");

// A stub runtime: exec answers the git commands runCodingTask issues, and the agent
// stub reports one edit — so the FULL handler+runner path runs with no real git or
// docker. cleanup is spied to prove the workdir is always disposed. (In production
// the injected runtime is a per-task docker container; the handler fails closed if
// it can't be created.)
function stubRuntime() {
  const cleanup = vi.fn(async () => {});
  const exec = async (argv: string[]) => {
    const sub = argv[1] === "-c" ? argv[3] : argv[1];
    if (sub === "status") {
      return { stdout: "M feature.txt\n", stderr: "", code: 0 };
    }
    if (sub === "rev-parse") {
      return { stdout: "a".repeat(40) + "\n", stderr: "", code: 0 };
    }
    if (sub === "show") {
      return { stdout: " feature.txt | 1 +\n", stderr: "", code: 0 };
    }
    return { stdout: "", stderr: "", code: 0 };
  };
  const runAgent = async (_a: unknown, emit: (e: CodingEvent) => void) => {
    emit({ type: "log", message: "stub agent edited" });
    return { ok: true, logTail: "stub" };
  };
  return {
    make: async (_timeoutSec: number): Promise<CodingRuntime> => ({
      workdir: "/tmp/coding-stub",
      deps: { exec, runAgent },
      cleanup,
    }),
    cleanup,
  };
}

let server: ReturnType<typeof createServer>;
let port = 0;
let currentRuntime = stubRuntime();
let currentAuth: unknown = { mode: "token", token: "t", allowTailscale: false };
let currentMake: (timeoutSec: number) => Promise<CodingRuntime> = currentRuntime.make;

beforeAll(async () => {
  server = createServer((req, res) => {
    void handleCodingTasksHttpRequest(req, res, { auth: currentAuth as never }, currentMake).then(
      (handled) => {
        if (!handled) {
          res.statusCode = 404;
          res.end("not found");
        }
      },
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function setRuntime(r = stubRuntime()) {
  currentRuntime = r;
  currentMake = r.make;
  currentAuth = { mode: "token", token: "t", allowTailscale: false };
}

async function post(body: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(`http://127.0.0.1:${port}/v1/coding-tasks`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-org-id": "acme",
      authorization: "Bearer t",
      ...headers,
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, text: await res.text() };
}

const okBody = {
  cloneUrl: "https://git.hanzo.ai/v1/git/acme/api.git",
  baseBranch: "main",
  branch: "agent/abc123",
  prompt: "fix the bug",
  sessionId: "sess_1",
  credential: { username: "x-access-token", token: "hk-secret" },
};

describe("POST /v1/coding-tasks", () => {
  it("streams NDJSON progress + a terminal result and always disposes the workdir", async () => {
    setRuntime();
    const { status, text } = await post(okBody);
    expect(status).toBe(200);
    const lines = text
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    const result = lines.find((l) => l.type === "result");
    expect(result?.ok).toBe(true);
    expect(result?.changed).toBe(true);
    expect(lines.some((l) => l.type === "step" && l.step === "push")).toBe(true);
    expect(currentRuntime.cleanup).toHaveBeenCalledTimes(1);
  });

  it("refuses a clone URL whose org does not match the authenticated org (isolation)", async () => {
    setRuntime();
    const { status } = await post({
      ...okBody,
      cloneUrl: "https://git.hanzo.ai/v1/git/evil/api.git",
    });
    expect(status).toBe(400);
    expect(currentRuntime.cleanup).not.toHaveBeenCalled();
  });

  it("refuses a clone URL on a non-allowlisted git host", async () => {
    setRuntime();
    const { status } = await post({
      ...okBody,
      cloneUrl: "https://evil.example.com/v1/git/acme/api.git",
    });
    expect(status).toBe(400);
    expect(currentRuntime.cleanup).not.toHaveBeenCalled();
  });

  it("rejects a non-https clone URL", async () => {
    setRuntime();
    const { status } = await post({
      ...okBody,
      cloneUrl: "http://git.hanzo.ai/v1/git/acme/api.git",
    });
    expect(status).toBe(400);
  });

  it("rejects a branch that is not the minted agent/<hex> shape", async () => {
    setRuntime();
    for (const branch of ["../evil", "HEAD~1", "a b", "", "agent/xyz", "agent/ABC123", "main"]) {
      const { status } = await post({ ...okBody, branch });
      expect(status, `branch=${branch}`).toBe(400);
    }
  });

  it("rejects a missing credential", async () => {
    setRuntime();
    const { status } = await post({ ...okBody, credential: { username: "x", token: "" } });
    expect(status).toBe(400);
  });

  it("rejects a request with no tenant identity", async () => {
    setRuntime();
    const { status } = await post(okBody, { "x-org-id": "" });
    expect(status).toBe(400);
  });

  it("returns 405 for non-POST", async () => {
    setRuntime();
    const res = await fetch(`http://127.0.0.1:${port}/v1/coding-tasks`, {
      method: "GET",
      headers: { "x-org-id": "acme", authorization: "Bearer t" },
    });
    expect(res.status).toBe(405);
  });

  it("fails closed (503) when gateway auth mode is not enforcing", async () => {
    setRuntime();
    currentAuth = { mode: "none" };
    const { status } = await post(okBody);
    expect(status).toBe(503);
  });

  it("fails closed (503) when the sandbox runtime cannot be created (no host fallback)", async () => {
    setRuntime();
    currentMake = async () => {
      throw new Error("container runtime unavailable");
    };
    const { status } = await post(okBody);
    expect(status).toBe(503);
  });

  it("caps concurrency per org (429 over the limit)", async () => {
    process.env.HANZO_CODING_ORG_CONCURRENCY = "1";
    try {
      let releaseFirst: () => void = () => {};
      const gate = new Promise<void>((r) => (releaseFirst = r));
      const cleanup = vi.fn(async () => {});
      currentAuth = { mode: "token", token: "t", allowTailscale: false };
      currentMake = async (): Promise<CodingRuntime> => {
        await gate; // hold the org's single slot until released
        return {
          workdir: "/tmp/x",
          deps: {
            exec: async () => ({ stdout: "", stderr: "", code: 0 }),
            runAgent: async () => ({ ok: true, logTail: "" }),
          },
          cleanup,
        };
      };
      const first = post(okBody); // acquires the slot, then blocks in makeRuntime
      await new Promise((r) => setTimeout(r, 50));
      const second = await post(okBody); // org already at cap 1 -> 429
      expect(second.status).toBe(429);
      releaseFirst();
      await first;
    } finally {
      delete process.env.HANZO_CODING_ORG_CONCURRENCY;
    }
  });
});
