import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createWindowsCmdShimFixture,
  restorePlatformPathEnv,
  setProcessPlatform,
  snapshotPlatformPathEnv,
} from "./test-helpers.js";
import { resolveWindowsRunbookSpawn } from "./windows-spawn.js";

describe("resolveWindowsRunbookSpawn", () => {
  let tempDir = "";
  const originalProcessState = snapshotPlatformPathEnv();

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "bot-runbook-win-spawn-"));
    setProcessPlatform("win32");
  });

  afterEach(async () => {
    restorePlatformPathEnv(originalProcessState);
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
      tempDir = "";
    }
  });

  it("unwraps cmd shim with %dp0% token", async () => {
    const scriptPath = path.join(tempDir, "shim-dist", "runbook-cli.cjs");
    const shimPath = path.join(tempDir, "shim", "runbook.cmd");
    await createWindowsCmdShimFixture({
      shimPath,
      scriptPath,
      shimLine: `"%dp0%\\..\\shim-dist\\runbook-cli.cjs" %*`,
    });

    const target = resolveWindowsRunbookSpawn(shimPath, ["run", "noop"], process.env);
    expect(target.command).toBe(process.execPath);
    expect(target.argv).toEqual([scriptPath, "run", "noop"]);
    expect(target.windowsHide).toBe(true);
  });

  it("unwraps cmd shim with %~dp0% token", async () => {
    const scriptPath = path.join(tempDir, "shim-dist", "runbook-cli.cjs");
    const shimPath = path.join(tempDir, "shim", "runbook.cmd");
    await createWindowsCmdShimFixture({
      shimPath,
      scriptPath,
      shimLine: `"%~dp0%\\..\\shim-dist\\runbook-cli.cjs" %*`,
    });

    const target = resolveWindowsRunbookSpawn(shimPath, ["run", "noop"], process.env);
    expect(target.command).toBe(process.execPath);
    expect(target.argv).toEqual([scriptPath, "run", "noop"]);
    expect(target.windowsHide).toBe(true);
  });

  it("ignores node.exe shim entries and picks runbook script", async () => {
    const shimDir = path.join(tempDir, "shim-with-node");
    const scriptPath = path.join(tempDir, "shim-dist-node", "runbook-cli.cjs");
    const shimPath = path.join(shimDir, "runbook.cmd");
    await fs.mkdir(path.dirname(scriptPath), { recursive: true });
    await fs.mkdir(shimDir, { recursive: true });
    await fs.writeFile(path.join(shimDir, "node.exe"), "", "utf8");
    await fs.writeFile(scriptPath, "module.exports = {};\n", "utf8");
    await fs.writeFile(
      shimPath,
      `@echo off\r\n"%~dp0%\\node.exe" "%~dp0%\\..\\shim-dist-node\\runbook-cli.cjs" %*\r\n`,
      "utf8",
    );

    const target = resolveWindowsRunbookSpawn(shimPath, ["run", "noop"], process.env);
    expect(target.command).toBe(process.execPath);
    expect(target.argv).toEqual([scriptPath, "run", "noop"]);
    expect(target.windowsHide).toBe(true);
  });

  it("resolves runbook.cmd from PATH and unwraps npm layout shim", async () => {
    const binDir = path.join(tempDir, "node_modules", ".bin");
    const packageDir = path.join(tempDir, "node_modules", "runbook");
    const scriptPath = path.join(packageDir, "dist", "cli.js");
    const shimPath = path.join(binDir, "runbook.cmd");
    await fs.mkdir(path.dirname(scriptPath), { recursive: true });
    await fs.mkdir(binDir, { recursive: true });
    await fs.writeFile(shimPath, "@echo off\r\n", "utf8");
    await fs.writeFile(
      path.join(packageDir, "package.json"),
      JSON.stringify({ name: "runbook", version: "0.0.0", bin: { runbook: "dist/cli.js" } }),
      "utf8",
    );
    await fs.writeFile(scriptPath, "module.exports = {};\n", "utf8");

    const env = {
      ...process.env,
      PATH: `${binDir};${process.env.PATH ?? ""}`,
      PATHEXT: ".CMD;.EXE",
    };
    const target = resolveWindowsRunbookSpawn("runbook", ["run", "noop"], env);
    expect(target.command).toBe(process.execPath);
    expect(target.argv).toEqual([scriptPath, "run", "noop"]);
    expect(target.windowsHide).toBe(true);
  });

  it("fails fast when wrapper cannot be resolved without shell execution", async () => {
    const badShimPath = path.join(tempDir, "bad-shim", "runbook.cmd");
    await fs.mkdir(path.dirname(badShimPath), { recursive: true });
    await fs.writeFile(badShimPath, "@echo off\r\nREM no entrypoint\r\n", "utf8");

    expect(() => resolveWindowsRunbookSpawn(badShimPath, ["run", "noop"], process.env)).toThrow(
      /without shell execution/,
    );
  });
});
