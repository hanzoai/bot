import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { BotPluginApi, BotPluginToolContext } from "../../../src/plugins/types.js";
import { createFlowTool } from "./flow-tool.js";

async function writeFakeFlowScript(scriptBody: string, prefix = "bot-flow-plugin-") {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  const isWindows = process.platform === "win32";

  if (isWindows) {
    const scriptPath = path.join(dir, "flow.js");
    const cmdPath = path.join(dir, "flow.cmd");
    await fs.writeFile(scriptPath, scriptBody, { encoding: "utf8" });
    const cmd = `@echo off\r\n"${process.execPath}" "${scriptPath}" %*\r\n`;
    await fs.writeFile(cmdPath, cmd, { encoding: "utf8" });
    return { dir, binPath: cmdPath };
  }

  const binPath = path.join(dir, "flow");
  const file = `#!/usr/bin/env node\n${scriptBody}\n`;
  await fs.writeFile(binPath, file, { encoding: "utf8", mode: 0o755 });
  return { dir, binPath };
}

async function writeFakeFlow(params: { payload: unknown }) {
  const scriptBody =
    `const payload = ${JSON.stringify(params.payload)};\n` +
    `process.stdout.write(JSON.stringify(payload));\n`;
  return await writeFakeFlowScript(scriptBody);
}

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
  it("runs flow and returns parsed envelope in details", async () => {
    const fake = await writeFakeFlow({
      payload: { ok: true, status: "ok", output: [{ hello: "world" }], requiresApproval: null },
    });

    const originalPath = process.env.PATH;
    process.env.PATH = `${fake.dir}${path.delimiter}${originalPath ?? ""}`;

    try {
      const tool = createFlowTool(fakeApi());
      const res = await tool.execute("call1", {
        action: "run",
        pipeline: "noop",
        timeoutMs: 1000,
      });

      expect(res.details).toMatchObject({ ok: true, status: "ok" });
    } finally {
      process.env.PATH = originalPath;
    }
  });

  it("tolerates noisy stdout before the JSON envelope", async () => {
    const payload = { ok: true, status: "ok", output: [], requiresApproval: null };
    const { dir } = await writeFakeFlowScript(
      `const payload = ${JSON.stringify(payload)};\n` +
        `console.log("noise before json");\n` +
        `process.stdout.write(JSON.stringify(payload));\n`,
      "bot-flow-plugin-noisy-",
    );

    const originalPath = process.env.PATH;
    process.env.PATH = `${dir}${path.delimiter}${originalPath ?? ""}`;

    try {
      const tool = createFlowTool(fakeApi());
      const res = await tool.execute("call-noisy", {
        action: "run",
        pipeline: "noop",
        timeoutMs: 1000,
      });

      expect(res.details).toMatchObject({ ok: true, status: "ok" });
    } finally {
      process.env.PATH = originalPath;
    }
  });

  it("requires absolute flowPath when provided (even though it is ignored)", async () => {
    const fake = await writeFakeFlow({
      payload: { ok: true, status: "ok", output: [{ hello: "world" }], requiresApproval: null },
    });

    const originalPath = process.env.PATH;
    process.env.PATH = `${fake.dir}${path.delimiter}${originalPath ?? ""}`;

    try {
      const tool = createFlowTool(fakeApi());
      await expect(
        tool.execute("call2", {
          action: "run",
          pipeline: "noop",
          flowPath: "./flow",
        }),
      ).rejects.toThrow(/absolute path/);
    } finally {
      process.env.PATH = originalPath;
    }
  });

  it("rejects flowPath (deprecated) when invalid", async () => {
    const fake = await writeFakeFlow({
      payload: { ok: true, status: "ok", output: [{ hello: "world" }], requiresApproval: null },
    });

    const originalPath = process.env.PATH;
    process.env.PATH = `${fake.dir}${path.delimiter}${originalPath ?? ""}`;

    try {
      const tool = createFlowTool(fakeApi());
      await expect(
        tool.execute("call2b", {
          action: "run",
          pipeline: "noop",
          flowPath: "/bin/bash",
        }),
      ).rejects.toThrow(/flow executable/);
    } finally {
      process.env.PATH = originalPath;
    }
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
    const fake = await writeFakeFlow({
      payload: { ok: true, status: "ok", output: [{ hello: "world" }], requiresApproval: null },
    });

    // Ensure `flow` is NOT discoverable via PATH, while still allowing our
    // fake flow (a Node script with `#!/usr/bin/env node`) to run.
    const originalPath = process.env.PATH;
    process.env.PATH = path.dirname(process.execPath);

    try {
      const tool = createFlowTool(fakeApi({ pluginConfig: { flowPath: fake.binPath } }));
      const res = await tool.execute("call-plugin-config", {
        action: "run",
        pipeline: "noop",
        timeoutMs: 1000,
      });

      expect(res.details).toMatchObject({ ok: true, status: "ok" });
    } finally {
      process.env.PATH = originalPath;
    }
  });

  it("rejects invalid JSON from flow", async () => {
    const { dir } = await writeFakeFlowScript(
      `process.stdout.write("nope");\n`,
      "bot-flow-plugin-bad-",
    );

    const originalPath = process.env.PATH;
    process.env.PATH = `${dir}${path.delimiter}${originalPath ?? ""}`;

    try {
      const tool = createFlowTool(fakeApi());
      await expect(
        tool.execute("call3", {
          action: "run",
          pipeline: "noop",
        }),
      ).rejects.toThrow(/invalid JSON/);
    } finally {
      process.env.PATH = originalPath;
    }
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
