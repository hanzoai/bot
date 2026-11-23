import { describe, expect, it, vi } from "vitest";
import { resolveHanzoGatewayBaseUrl } from "../agents/models-config.providers.js";
import { hanzodLocalConfig } from "../commands/hanzo-cloud-config.js";
import {
  botCheckGateway,
  candidateHanzodPaths,
  DEFAULT_HANZOD_ORIGIN,
  discoverHanzodBinary,
  ensureHanzodRunning,
  HanzodBotClient,
  hanzodClusterDown,
  hanzodClusterUp,
  hanzodStatus,
  hanzodWorkerStatus,
  localWorkspaceRunDev,
} from "./hanzod.js";

const reqUrl = (input: RequestInfo | URL): string =>
  input instanceof Request ? input.url : input instanceof URL ? input.href : input;

describe("unified hanzod backend (127.0.0.1:3690)", () => {
  it("resolves hanzod sidecar and ~/.hanzo/bin/hanzod paths in priority order", () => {
    const candidates = candidateHanzodPaths({
      platform: "darwin",
      env: { HANZOD_BIN: "/opt/custom/hanzod", PATH: "/usr/bin:/bin" },
      execPath: "/Applications/Hanzo.app/Contents/MacOS/hanzo",
      homeDir: "/Users/z",
    });
    expect(candidates[0]).toBe("/opt/custom/hanzod");
    expect(candidates).toContain("/Applications/Hanzo.app/Contents/MacOS/binaries/hanzod");
    expect(candidates).toContain("/Applications/Hanzo.app/Contents/Resources/hanzod");
    expect(candidates).toContain("/Users/z/.hanzo/bin/hanzod");

    expect(
      discoverHanzodBinary({
        platform: "linux",
        env: {},
        homeDir: "/home/z",
        exists: (p) => p === "/home/z/.hanzo/bin/hanzod",
      }),
    ).toBe("/home/z/.hanzo/bin/hanzod");
  });

  it("auto-starts hanzod on 127.0.0.1:3690 and returns unified GatewayStatus metadata", async () => {
    let listening = false;
    const spawned: string[] = [];

    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = reqUrl(input);
      if (!listening) {
        throw new Error("ECONNREFUSED");
      }
      if (url.endsWith("/v1/bot/health")) {
        return new Response(JSON.stringify({ ok: true, service: "bot", version: "0.4.0" }), {
          status: 200,
        });
      }
      if (url.endsWith("/v1/hanzod")) {
        return new Response(
          JSON.stringify({
            version: "0.4.0",
            sole_desktop_backend: true,
            tasks_worker: { linked: true, busy: false },
          }),
          { status: 200 },
        );
      }
      if (url.endsWith("/v1/cluster/health")) {
        return new Response(JSON.stringify({ state: "running" }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as unknown as typeof fetch;

    const status = await botCheckGateway(undefined, {
      env: {},
      homeDir: "/home/z",
      exists: (p) => p === "/home/z/.hanzo/bin/hanzod",
      fetchImpl,
      sleep: async () => undefined,
      spawnDaemon: (bin) => {
        spawned.push(bin);
        listening = true;
      },
    });

    expect(spawned).toEqual(["/home/z/.hanzo/bin/hanzod"]);
    expect(status).toEqual({
      connected: true,
      url: DEFAULT_HANZOD_ORIGIN,
      version: "0.4.0",
      sole_desktop_backend: true,
      tasks_linked: true,
      cluster_state: "running",
    });
  });

  it("queries status, worker, cluster up/down, and routes workspace dev through hanzod first", async () => {
    const calls: Array<{ url: string; method: string; auth: string | null }> = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = reqUrl(input);
      const headers = new Headers(init?.headers);
      calls.push({ url, method: init?.method ?? "GET", auth: headers.get("authorization") });

      if (url.endsWith("/v1/hanzod")) {
        return new Response(JSON.stringify({ version: "0.4.0", sole_desktop_backend: true }), {
          status: 200,
        });
      }
      if (url.endsWith("/v1/hanzod/worker")) {
        return new Response(JSON.stringify({ linked: true, defer_when_busy: true }), {
          status: 200,
        });
      }
      if (url.endsWith("/v1/cluster/up")) {
        return new Response(JSON.stringify({ ok: true, state: "running", mode: "k3s" }), {
          status: 200,
        });
      }
      if (url.endsWith("/v1/cluster/down")) {
        return new Response(JSON.stringify({ ok: true, state: "stopped" }), { status: 200 });
      }
      if (url.endsWith("/v1/bot/bots/dev/run")) {
        return new Response(JSON.stringify({ run_id: "run_1", status: "completed" }), {
          status: 200,
        });
      }
      return new Response("not found", { status: 404 });
    }) as unknown as typeof fetch;

    const deps = {
      env: { HANZO_API_KEY: "sk-live-secret" },
      fetchImpl,
      sleep: async () => undefined,
    };

    expect(await ensureHanzodRunning(deps)).toBe(true);
    expect(await hanzodStatus(deps)).toMatchObject({ sole_desktop_backend: true });
    expect(await hanzodWorkerStatus(deps)).toMatchObject({ linked: true });
    expect(await hanzodClusterUp("k3s", deps)).toMatchObject({ state: "running", mode: "k3s" });
    expect(await hanzodClusterDown(deps)).toMatchObject({ state: "stopped" });

    const devRun = await localWorkspaceRunDev({
      workspacePath: "/tmp/proj",
      prompt: "run tests",
      deps,
    });
    expect(devRun).toMatchObject({
      backend: "hanzod",
      route: "/v1/bot/bots/dev/run",
      run_id: "run_1",
    });
    expect(calls.find((c) => c.url.endsWith("/v1/bot/bots/dev/run"))?.auth).toBe(
      "Bearer sk-live-secret",
    );
  });

  it("HanzodBotClient uses 127.0.0.1:3690/v1/bot/bots/:id/run and /v1/engine/chat/completions (never :18789 or :36900)", async () => {
    const requestedUrls: Array<{ url: string; auth: string | null }> = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = reqUrl(input);
      const headers = new Headers(init?.headers);
      requestedUrls.push({ url, auth: headers.get("authorization") });

      if (url === "http://127.0.0.1:3690/v1/bot/bots/coder/run") {
        return new Response(JSON.stringify({ reply: "handled by native hanzod bot" }), {
          status: 200,
        });
      }
      if (url === "https://api.hanzo.ai/v1/chat/completions") {
        throw new Error("offline");
      }
      if (url === "http://127.0.0.1:3690/v1/engine/chat/completions") {
        return new Response(
          JSON.stringify({ choices: [{ message: { content: "handled by hanzod local engine" } }] }),
          { status: 200 },
        );
      }
      return new Response("unexpected", { status: 500 });
    }) as unknown as typeof fetch;

    const client = new HanzodBotClient({ token: "iam-tok-99", fetchImpl });
    expect(client.localBaseUrl).toBe("http://127.0.0.1:3690");

    const localReply = await client.chat({ id: "coder", endpoint: "local" }, [
      { role: "user", content: "hello local" },
    ]);
    expect(localReply).toBe("handled by native hanzod bot");

    const fallbackReply = await client.chat({ id: "assistant", endpoint: "cloud" }, [
      { role: "user", content: "hello offline fallback" },
    ]);
    expect(fallbackReply).toBe("handled by hanzod local engine");

    expect(requestedUrls.map((r) => r.url)).toEqual([
      "http://127.0.0.1:3690/v1/bot/bots/coder/run",
      "https://api.hanzo.ai/v1/chat/completions",
      "http://127.0.0.1:3690/v1/engine/chat/completions",
    ]);
    expect(requestedUrls[0]?.auth).toBe("Bearer iam-tok-99");
  });

  it("resolves HANZOD_URL and HANZO_BACKEND=hanzod in gateway model provider config", () => {
    expect(resolveHanzoGatewayBaseUrl({})).toBe("https://api.hanzo.ai/v1");
    expect(resolveHanzoGatewayBaseUrl({ HANZOD_URL: "http://127.0.0.1:3690" })).toBe(
      "http://127.0.0.1:3690/v1",
    );
    expect(resolveHanzoGatewayBaseUrl({ HANZOD_URL: "http://127.0.0.1:3690/v1/engine/" })).toBe(
      "http://127.0.0.1:3690/v1/engine",
    );
    expect(resolveHanzoGatewayBaseUrl({ HANZO_BACKEND: "hanzod" })).toBe(
      "http://127.0.0.1:3690/v1",
    );
    expect(hanzodLocalConfig("/home/z").models.providers.hanzo.baseUrl).toBe(
      "http://127.0.0.1:3690/v1/engine",
    );
  });
});
