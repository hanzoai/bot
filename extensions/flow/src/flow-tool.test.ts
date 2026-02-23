import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { BotPluginApi, BotPluginToolContext } from "../../../src/plugins/types.js";

const spawnState = vi.hoisted(() => ({
  queue: [] as Array<{ stdout: string; stderr?: string; exitCode?: number }>,
  spawn: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  spawn: (...args: unknown[]) => spawnState.spawn(...args),
}));

let createFlowTool: typeof import("./flow-tool.js").createFlowTool;

function fakeApi(overrides: Partial<BotPluginApi> = {}): BotPluginApi {
  return {
    id: "flow",
    name: "flow",
    source: "test",
    config: {},
    pluginConfig: {},
    // oxlint-disable-next-line typescript/no-explicit-any
    runtime: { version: "test" } as any,
    logger: { info() {}, warn() {}, error() {}, debug() {} },
    registerTool() {},
    registerHttpHandler() {},
    registerChannel() {},
    registerGatewayMethod() {},
    registerCli() {},
    registerService() {},
    registerProvider() {},
    registerHook() {},
    registerHttpRoute() {},
    registerCommand() {},
    on() {},
    resolvePath: (p) => p,
    ...overrides,
  };
}

function fakeCtx(overrides: Partial<BotPluginToolContext> = {}): BotPluginToolContext {
  return {
    config: {},
    workspaceDir: "/tmp",
    agentDir: "/tmp",
    agentId: "main",
    sessionKey: "main",
    messageChannel: undefined,
    agentAccountId: undefined,
    sandboxed: false,
    ...overrides,
  };
}

describe("flow plugin tool", () => {
  let tempDir = "";
  let flowBinPath = "";

  beforeAll(async () => {
    ({ createFlowTool } = await import("./flow-tool.js"));

    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "bot-flow-plugin-"));
    flowBinPath = path.join(tempDir, process.platform === "win32" ? "flow.cmd" : "flow");
    await fs.writeFile(flowBinPath, "", { encoding: "utf8", mode: 0o755 });
  });

  afterAll(async () => {
    if (!tempDir) {
      return;
    }
    if (process.platform === "win32") {
      await fs.rm(tempDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
    } else {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    spawnState.queue.length = 0;
    spawnState.spawn.mockReset();
    spawnState.spawn.mockImplementation(() => {
      const next = spawnState.queue.shift() ?? { stdout: "" };
      const stdout = new PassThrough();
      const stderr = new PassThrough();
      const child = new EventEmitter() as EventEmitter & {
        stdout: PassThrough;
        stderr: PassThrough;
        kill: (signal?: string) => boolean;
      };
      child.stdout = stdout;
      child.stderr = stderr;
      child.kill = () => true;

      setImmediate(() => {
        if (next.stderr) {
          stderr.end(next.stderr);
        } else {
          stderr.end();
        }
        stdout.end(next.stdout);
        child.emit("exit", next.exitCode ?? 0);
      });

      return child;
    });
  });

  it("runs flow and returns parsed envelope in details", async () => {
    spawnState.queue.push({
      stdout: JSON.stringify({
        ok: true,
        status: "ok",
        output: [{ hello: "world" }],
        requiresApproval: null,
      }),
    });

    const tool = createFlowTool(fakeApi());
    const res = await tool.execute("call1", {
      action: "run",
      pipeline: "noop",
      timeoutMs: 1000,
    });

    expect(spawnState.spawn).toHaveBeenCalled();
    expect(res.details).toMatchObject({ ok: true, status: "ok" });
  });

  it("tolerates noisy stdout before the JSON envelope", async () => {
    const payload = { ok: true, status: "ok", output: [], requiresApproval: null };
    spawnState.queue.push({
      stdout: `noise before json\n${JSON.stringify(payload)}`,
    });

    const tool = createFlowTool(fakeApi());
    const res = await tool.execute("call-noisy", {
      action: "run",
      pipeline: "noop",
      timeoutMs: 1000,
    });

    expect(res.details).toMatchObject({ ok: true, status: "ok" });
  });

  it("requires absolute flowPath when provided (even though it is ignored)", async () => {
    const tool = createFlowTool(fakeApi());
    await expect(
      tool.execute("call2", {
        action: "run",
        pipeline: "noop",
        flowPath: "./flow",
      }),
    ).rejects.toThrow(/absolute path/);
  });

  it("rejects flowPath (deprecated) when invalid", async () => {
    const tool = createFlowTool(fakeApi());
    await expect(
      tool.execute("call2b", {
        action: "run",
        pipeline: "noop",
        flowPath: "/bin/bash",
      }),
    ).rejects.toThrow(/flow executable/);
  });

  it("rejects absolute cwd", async () => {
    const tool = createFlowTool(fakeApi());
    await expect(
      tool.execute("call2c", {
        action: "run",
        pipeline: "noop",
        cwd: "/tmp",
      }),
    ).rejects.toThrow(/cwd must be a relative path/);
  });

  it("rejects cwd that escapes the gateway working directory", async () => {
    const tool = createFlowTool(fakeApi());
    await expect(
      tool.execute("call2d", {
        action: "run",
        pipeline: "noop",
        cwd: "../../etc",
      }),
    ).rejects.toThrow(/must stay within/);
  });

  it("uses pluginConfig.flowPath when provided", async () => {
    spawnState.queue.push({
      stdout: JSON.stringify({
        ok: true,
        status: "ok",
        output: [{ hello: "world" }],
        requiresApproval: null,
      }),
    });

    const tool = createFlowTool(fakeApi({ pluginConfig: { flowPath: flowBinPath } }));
    const res = await tool.execute("call-plugin-config", {
      action: "run",
      pipeline: "noop",
      timeoutMs: 1000,
    });

    expect(spawnState.spawn).toHaveBeenCalled();
    const [execPath] = spawnState.spawn.mock.calls[0] ?? [];
    expect(execPath).toBe(flowBinPath);
    expect(res.details).toMatchObject({ ok: true, status: "ok" });
  });

  it("rejects invalid JSON from flow", async () => {
    spawnState.queue.push({ stdout: "nope" });

    const tool = createFlowTool(fakeApi());
    await expect(
      tool.execute("call3", {
        action: "run",
        pipeline: "noop",
      }),
    ).rejects.toThrow(/invalid JSON/);
  });

  it("can be gated off in sandboxed contexts", async () => {
    const api = fakeApi();
    const factoryTool = (ctx: BotPluginToolContext) => {
      if (ctx.sandboxed) {
        return null;
      }
      return createFlowTool(api);
    };

    expect(factoryTool(fakeCtx({ sandboxed: true }))).toBeNull();
    expect(factoryTool(fakeCtx({ sandboxed: false }))?.name).toBe("flow");
  });
});
