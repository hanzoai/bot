import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Mock the pod-boundary auth to pass and config to be empty, so this test isolates
// the handler's OWN concerns: org-match isolation, body validation, and NDJSON
// streaming. (Auth-gate behavior is covered by the shared auth tests.)
vi.mock("./auth.js", () => ({
  authorizeHttpGatewayConnect: async () => ({ ok: true }),
}));
vi.mock("../config/config.js", () => ({ loadConfig: () => ({}) }));
vi.mock("../logger.js", () => ({ logWarn: () => {}, logInfo: () => {}, logError: () => {} }));

const { handleCodingTasksHttpRequest } = await import("./coding-tasks-http.js");

// A stub runtime: exec answers the git commands runCodingTask issues, and the
// agent stub reports one edit — so the FULL handler+runner path runs with no real
// git or docker. cleanup is spied to prove the workdir is always disposed.
function stubRuntime() {
  const cleanup = vi.fn(async () => {});
  const exec = async (argv: string[]) => {
    const sub = argv[1];
    if (sub === "status") return { stdout: "M feature.txt\n", stderr: "", code: 0 };
    if (sub === "rev-parse") return { stdout: "a".repeat(40) + "\n", stderr: "", code: 0 };
    if (sub === "show") return { stdout: " feature.txt | 1 +\n", stderr: "", code: 0 };
    return { stdout: "", stderr: "", code: 0 };
  };
  const runAgent = async (_a: unknown, emit: (e: unknown) => void) => {
    emit({ type: "log", message: "stub agent edited" });
    return { ok: true, logTail: "stub" };
  };
  return {
    make: async () => ({ workdir: "/tmp/coding-stub", deps: { exec, runAgent }, cleanup }),
    cleanup,
  };
}

let server: ReturnType<typeof createServer>;
let port = 0;
let currentRuntime = stubRuntime();

beforeAll(async () => {
  server = createServer((req, res) => {
    void handleCodingTasksHttpRequest(
      req,
      res,
      { auth: { mode: "token", token: "t", allowTailscale: false } as never },
      currentRuntime.make,
    ).then((handled) => {
      if (!handled) {
        res.statusCode = 404;
        res.end("not found");
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

async function post(body: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(`http://127.0.0.1:${port}/v1/coding-tasks`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-org-id": "acme", authorization: "Bearer t", ...headers },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, text };
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
    currentRuntime = stubRuntime();
    const { status, text } = await post(okBody);
    expect(status).toBe(200);
    const lines = text.trim().split("\n").map((l) => JSON.parse(l));
    const result = lines.find((l) => l.type === "result");
    expect(result?.ok).toBe(true);
    expect(result?.changed).toBe(true);
    expect(lines.some((l) => l.type === "step" && l.step === "push")).toBe(true);
    expect(currentRuntime.cleanup).toHaveBeenCalledTimes(1);
  });

  it("refuses a clone URL whose org does not match the authenticated org (isolation)", async () => {
    currentRuntime = stubRuntime();
    const { status } = await post({ ...okBody, cloneUrl: "https://git.hanzo.ai/v1/git/evil/api.git" });
    expect(status).toBe(400);
    // The run never started, so the workdir was never even created.
    expect(currentRuntime.cleanup).not.toHaveBeenCalled();
  });

  it("rejects a non-https clone URL", async () => {
    const { status } = await post({ ...okBody, cloneUrl: "http://git.hanzo.ai/v1/git/acme/api.git" });
    expect(status).toBe(400);
  });

  it("rejects an unsafe branch name", async () => {
    for (const branch of ["../evil", "HEAD~1", "a b", ""]) {
      const { status } = await post({ ...okBody, branch });
      expect(status, `branch=${branch}`).toBe(400);
    }
  });

  it("rejects a missing credential", async () => {
    const { status } = await post({ ...okBody, credential: { username: "x", token: "" } });
    expect(status).toBe(400);
  });

  it("rejects a request with no tenant identity", async () => {
    const { status } = await post(okBody, { "x-org-id": "" });
    expect(status).toBe(400);
  });

  it("returns 405 for non-POST", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/v1/coding-tasks`, {
      method: "GET",
      headers: { "x-org-id": "acme", authorization: "Bearer t" },
    });
    expect(res.status).toBe(405);
  });
});
