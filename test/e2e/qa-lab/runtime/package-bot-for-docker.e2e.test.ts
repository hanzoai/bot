// Package Bot For Docker tests cover QA Lab package artifact evidence.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { MAX_TIMER_TIMEOUT_MS } from "@hanzo/bot-normalization-core/number-coercion";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DOCKER_SELECTED_PLUGIN_BUILD_IDS_ENV } from "../../../../scripts/lib/bundled-plugin-build-entries.mjs";
import {
  buildPackageArtifacts,
  packBotPackageForDocker,
  parseArgs,
  prepareBundledAiRuntimePackage,
  runCommandForTest,
  writePackageInventoryForDocker,
} from "../../../../scripts/package-bot-for-docker.mjs";
import { useAutoCleanupTempDirTracker } from "../../../helpers/temp-dir.js";

const skipBundledAiRuntime = async (): Promise<() => Promise<void>> => async () => {};
const tempDirs = useAutoCleanupTempDirTracker(afterEach);

function isProcessAlive(pid: number): boolean {
  if (!Number.isSafeInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function readPid(filePath: string, timeoutMs: number): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (fs.existsSync(filePath)) {
      const pid = Number(fs.readFileSync(filePath, "utf8").trim());
      if (Number.isSafeInteger(pid) && pid > 0) {
        return pid;
      }
    }
    await sleep(5);
  }
  throw new Error(`timeout waiting for a positive pid in ${filePath}`);
}

async function waitForDead(pid: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isProcessAlive(pid)) {
      return;
    }
    await sleep(5);
  }
  throw new Error(`process still alive: ${pid}`);
}

async function waitForExit(
  child: ReturnType<typeof spawn>,
  timeoutMs: number,
): Promise<{ signal: NodeJS.Signals | null; status: number | null }> {
  return await new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("timeout waiting for child exit")),
      timeoutMs,
    );
    child.on("close", (status, signal) => {
      clearTimeout(timeout);
      resolve({ signal, status });
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

describe("package-bot-for-docker", () => {
  it.runIf(process.platform === "win32")(
    "runs npm through the toolchain-local runner on Windows",
    async () => {
      const output = await runCommandForTest("npm", ["--version"], process.cwd(), {
        captureStdout: true,
        timeoutMs: 30_000,
      });

      expect(output.trim()).toMatch(/^\d+\.\d+\.\d+$/u);
    },
  );

  it.runIf(process.platform === "win32")(
    "runs pnpm.cmd through the portable runner on Windows",
    async () => {
      const tempDir = tempDirs.make("bot-package-pnpm-runner-");
      fs.writeFileSync(
        path.join(tempDir, "pnpm.cmd"),
        '@echo off\r\nif "%~1"=="probe" echo package-pnpm-runner-ok\r\n',
      );
      const env = { ...process.env };
      for (const key of Object.keys(env)) {
        if (key.toUpperCase() === "PATH" || key.toUpperCase() === "PATHEXT") {
          delete env[key];
        }
      }
      env.PATH = tempDir;
      env.PATHEXT = ".CMD";
      env.npm_execpath = "";

      const output = await runCommandForTest("pnpm", ["probe"], tempDir, {
        captureStdout: true,
        env,
        timeoutMs: 30_000,
      });

      expect(output.trim()).toBe("package-pnpm-runner-ok");
    },
  );

  it.runIf(process.platform === "win32")(
    "kills pnpm.cmd descendants when the package command times out",
    async () => {
      const tempDir = tempDirs.make("bot-package-pnpm-timeout-");
      const childPidPath = path.join(tempDir, "child.pid");
      const childScriptPath = path.join(tempDir, "child.cjs");
      fs.writeFileSync(
        childScriptPath,
        [
          "const fs = require('node:fs');",
          "fs.writeFileSync(process.env.BOT_TEST_CHILD_PID, String(process.pid));",
          "setInterval(() => {}, 1000);",
        ].join("\n"),
      );
      fs.writeFileSync(
        path.join(tempDir, "pnpm.cmd"),
        `@echo off\r\n"${process.execPath}" "${childScriptPath}"\r\n`,
      );
      const env = { ...process.env };
      for (const key of Object.keys(env)) {
        if (key.toUpperCase() === "PATH" || key.toUpperCase() === "PATHEXT") {
          delete env[key];
        }
      }
      env.PATH = tempDir;
      env.PATHEXT = ".CMD";
      env.npm_execpath = "";
      env.BOT_TEST_CHILD_PID = childPidPath;

      let childPid = 0;
      try {
        const runPromise = runCommandForTest("pnpm", ["probe"], tempDir, {
          env,
          killAfterMs: 25,
          timeoutMs: 500,
        });
        childPid = await readPid(childPidPath, 2_000);
        await expect(runPromise).rejects.toThrow(/timed out after 500ms/u);
        await waitForDead(childPid, 2_000);
      } finally {
        if (childPid && isProcessAlive(childPid)) {
          process.kill(childPid, "SIGKILL");
        }
      }
    },
  );

  it("parses package artifact output options", () => {
    expect(
      parseArgs([
        "--output-dir",
        ".artifacts/docker",
        "--output-name=bot-current.tgz",
        "--pack-json",
        ".artifacts/docker/pack.json",
        "--source-dir",
        "/repo",
        "--allow-unreleased-changelog",
        "--skip-build",
      ]),
    ).toEqual({
      allowUnreleasedChangelog: true,
      outputDir: ".artifacts/docker",
      outputName: "bot-current.tgz",
      packJson: ".artifacts/docker/pack.json",
      pnpmPack: false,
      skipBuild: true,
      sourceDir: "/repo",
    });
  });

  it("rejects missing package artifact option values", () => {
    for (const flag of ["--output-dir", "--output-name", "--source-dir"]) {
      expect(() => parseArgs([flag])).toThrow(`${flag} requires a value`);
      expect(() => parseArgs([flag, "--skip-build"])).toThrow(`${flag} requires a value`);
      expect(() => parseArgs([flag, "-h"])).toThrow(`${flag} requires a value`);
      expect(() => parseArgs([`${flag}=`])).toThrow(`${flag} requires a value`);
      expect(() => parseArgs([`${flag}=-h`])).toThrow(`${flag} requires a value`);
    }
  });

  it("rejects duplicate package artifact CLI options", () => {
    const duplicateCases = [
      ["--output-dir", ["--output-dir", "one", "--output-dir=two"]],
      ["--output-name", ["--output-name", "one.tgz", "--output-name=two.tgz"]],
      ["--pack-json", ["--pack-json", "one.json", "--pack-json=two.json"]],
      [
        "--allow-unreleased-changelog",
        ["--allow-unreleased-changelog", "--allow-unreleased-changelog"],
      ],
      ["--pnpm-pack", ["--pnpm-pack", "--pnpm-pack"]],
      ["--source-dir", ["--source-dir", "/repo-a", "--source-dir=/repo-b"]],
      ["--skip-build", ["--skip-build", "--skip-build"]],
    ] satisfies Array<[string, string[]]>;

    for (const [flag, args] of duplicateCases) {
      expect(() => parseArgs(args), flag).toThrow(`${flag} was provided more than once`);
    }
  });

  it("loads from a trusted harness checkout without installed dependencies", async () => {
    const tempRoot = tempDirs.make("bot-package-harness-");
    const copiedFiles = [
      "scripts/package-bot-for-docker.mjs",
      "scripts/package-changelog.mjs",
      "scripts/npm-runner.mjs",
      "scripts/pnpm-runner.mjs",
      "scripts/windows-cmd-helpers.mjs",
      "scripts/lib/bundled-plugin-build-entries.mjs",
      "scripts/lib/bundled-plugin-paths.mjs",
      "scripts/lib/managed-child-process.mjs",
      "scripts/lib/optional-bundled-clusters.mjs",
      "scripts/lib/windows-taskkill.mjs",
    ];
    try {
      for (const relativePath of copiedFiles) {
        const target = path.join(tempRoot, relativePath);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(relativePath, target);
      }
      const result = await new Promise<{ status: number | null; stderr: string }>(
        (resolve, reject) => {
          const child = spawn(
            process.execPath,
            [path.join(tempRoot, "scripts/package-bot-for-docker.mjs"), "--invalid"],
            { cwd: tempRoot, stdio: ["ignore", "ignore", "pipe"] },
          );
          let stderr = "";
          child.stderr.on("data", (chunk) => {
            stderr += String(chunk);
          });
          child.on("error", reject);
          child.on("close", (status) => resolve({ status, stderr }));
        },
      );

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("unknown argument: --invalid");
      expect(result.stderr).not.toContain("ERR_MODULE_NOT_FOUND");
    } finally {
      fs.rmSync(tempRoot, { force: true, recursive: true });
    }
  });

  it("writes inventory for a frozen source checkout without the trusted helper", async () => {
    const sourceDir = tempDirs.make("bot-package-frozen-source-");
    fs.mkdirSync(path.join(sourceDir, "dist"), { recursive: true });
    fs.mkdirSync(path.join(sourceDir, "scripts"), { recursive: true });
    fs.mkdirSync(path.join(sourceDir, "node_modules", "tsx"), { recursive: true });
    fs.writeFileSync(path.join(sourceDir, "package.json"), '{"name":"bot"}\n');
    fs.writeFileSync(
      path.join(sourceDir, "node_modules", "tsx", "package.json"),
      '{"name":"tsx","exports":"./loader.mjs","type":"module"}\n',
    );
    fs.writeFileSync(path.join(sourceDir, "node_modules", "tsx", "loader.mjs"), "export {};\n");
    fs.writeFileSync(path.join(sourceDir, "dist", "entry.js"), "export {};\n");
    fs.writeFileSync(
      path.join(sourceDir, "scripts", "write-package-dist-inventory.ts"),
      [
        'import fs from "node:fs";',
        'fs.writeFileSync("dist/postinstall-inventory.json", JSON.stringify(["dist/entry.js"]));',
      ].join("\n"),
    );

    await writePackageInventoryForDocker(
      sourceDir,
      async (command: string, args: string[], cwd: string) => {
        expect({ command, cwd }).toEqual({ command: "node", cwd: sourceDir });
        expect(args).toEqual([
          "--import",
          pathToFileURL(path.join(sourceDir, "node_modules", "tsx", "loader.mjs")).href,
          path.join(sourceDir, "scripts", "write-package-dist-inventory.ts"),
        ]);
        fs.writeFileSync(
          path.join(sourceDir, "dist", "postinstall-inventory.json"),
          JSON.stringify(["dist/entry.js"]),
        );
      },
    );

    expect(
      JSON.parse(
        fs.readFileSync(path.join(sourceDir, "dist", "postinstall-inventory.json"), "utf8"),
      ),
    ).toEqual(["dist/entry.js"]);
    expect(fs.existsSync(path.join(sourceDir, "scripts", "lib", "package-dist-inventory.ts"))).toBe(
      false,
    );
  });

  it("rejects pnpm pack with npm metadata output", () => {
    expect(parseArgs(["--pnpm-pack"]).pnpmPack).toBe(true);
    expect(() => parseArgs(["--pnpm-pack", "--pack-json", "pack.json"])).toThrow(
      "--pack-json cannot be combined with --pnpm-pack",
    );
  });

  it("rejects package artifact output names that escape the output directory", () => {
    for (const outputName of [
      "../bot-current.tgz",
      "nested/bot-current.tgz",
      "bot-current.zip",
      ".bot-current.tgz",
    ]) {
      expect(() => parseArgs(["--output-name", outputName])).toThrow(
        `--output-name must be a tarball filename, not a path: ${outputName}`,
      );
    }

    expect(parseArgs(["--output-name", "bot-current.tar.gz"]).outputName).toBe(
      "bot-current.tar.gz",
    );
  });

  it("uses build-all with declaration generation for package artifacts", async () => {
    const calls: Array<{
      command: string;
      args: string[];
      cwd: string;
      noPnpm: string | undefined;
      packageExtensions: string | undefined;
      dockerBuildExtensions: string | undefined;
      internalDockerBuildPluginIds: string | undefined;
      privateQa: string | undefined;
      skipDts: string | undefined;
      timeoutMs: number | undefined;
    }> = [];
    const previousTimeout = process.env.BOT_DOCKER_PACKAGE_BUILD_TIMEOUT_MS;
    const previousSkipDts = process.env.BOT_RUN_NODE_SKIP_DTS_BUILD;
    const previousPackageExtensions = process.env.BOT_EXTENSIONS;
    const previousDockerBuildExtensions = process.env.BOT_DOCKER_BUILD_EXTENSIONS;
    const previousInternalPluginIds = process.env[DOCKER_SELECTED_PLUGIN_BUILD_IDS_ENV];
    const previousPrivateQa = process.env.BOT_BUILD_PRIVATE_QA;
    process.env.BOT_DOCKER_PACKAGE_BUILD_TIMEOUT_MS = "1234";
    process.env.BOT_RUN_NODE_SKIP_DTS_BUILD = "1";
    process.env.BOT_EXTENSIONS = "clickclack";
    process.env.BOT_DOCKER_BUILD_EXTENSIONS = "slack";
    process.env[DOCKER_SELECTED_PLUGIN_BUILD_IDS_ENV] = "msteams";
    process.env.BOT_BUILD_PRIVATE_QA = "1";

    try {
      await buildPackageArtifacts("/repo", {
        runImpl: async (
          command: string,
          args: string[],
          cwd: string,
          options: { env?: NodeJS.ProcessEnv; timeoutMs?: number },
        ) => {
          calls.push({
            command,
            args,
            cwd,
            noPnpm: options.env?.BOT_BUILD_ALL_NO_PNPM,
            packageExtensions: options.env?.BOT_EXTENSIONS,
            dockerBuildExtensions: options.env?.BOT_DOCKER_BUILD_EXTENSIONS,
            internalDockerBuildPluginIds: options.env?.[DOCKER_SELECTED_PLUGIN_BUILD_IDS_ENV],
            privateQa: options.env?.BOT_BUILD_PRIVATE_QA,
            skipDts: options.env?.BOT_RUN_NODE_SKIP_DTS_BUILD,
            timeoutMs: options.timeoutMs,
          });
        },
      });
    } finally {
      if (previousTimeout === undefined) {
        delete process.env.BOT_DOCKER_PACKAGE_BUILD_TIMEOUT_MS;
      } else {
        process.env.BOT_DOCKER_PACKAGE_BUILD_TIMEOUT_MS = previousTimeout;
      }
      if (previousSkipDts === undefined) {
        delete process.env.BOT_RUN_NODE_SKIP_DTS_BUILD;
      } else {
        process.env.BOT_RUN_NODE_SKIP_DTS_BUILD = previousSkipDts;
      }
      for (const [envName, previousValue] of [
        ["BOT_EXTENSIONS", previousPackageExtensions],
        ["BOT_DOCKER_BUILD_EXTENSIONS", previousDockerBuildExtensions],
        [DOCKER_SELECTED_PLUGIN_BUILD_IDS_ENV, previousInternalPluginIds],
        ["BOT_BUILD_PRIVATE_QA", previousPrivateQa],
      ] as const) {
        if (previousValue === undefined) {
          delete process.env[envName];
        } else {
          process.env[envName] = previousValue;
        }
      }
    }

    expect(calls).toEqual([
      {
        command: "node",
        args: ["scripts/build-all.mjs", "full"],
        cwd: "/repo",
        dockerBuildExtensions: undefined,
        internalDockerBuildPluginIds: undefined,
        noPnpm: "1",
        packageExtensions: undefined,
        privateQa: undefined,
        skipDts: "0",
        timeoutMs: 1234,
      },
    ]);
  });

  it("rejects loose package artifact timeout env values", async () => {
    const previousTimeout = process.env.BOT_DOCKER_PACKAGE_BUILD_TIMEOUT_MS;
    try {
      for (const value of ["1e3", "123.9", "9007199254740993", "0"]) {
        process.env.BOT_DOCKER_PACKAGE_BUILD_TIMEOUT_MS = value;

        await expect(
          buildPackageArtifacts("/repo", {
            runImpl: async () => undefined,
          }),
        ).rejects.toThrow(
          "BOT_DOCKER_PACKAGE_BUILD_TIMEOUT_MS must be a positive timeout in milliseconds",
        );
      }
    } finally {
      if (previousTimeout === undefined) {
        delete process.env.BOT_DOCKER_PACKAGE_BUILD_TIMEOUT_MS;
      } else {
        process.env.BOT_DOCKER_PACKAGE_BUILD_TIMEOUT_MS = previousTimeout;
      }
    }
  });

  it("bundles and restores the separately packed AI runtime", async () => {
    const sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), "bot-docker-ai-source-"));
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "bot-docker-ai-output-"));
    const packageJsonPath = path.join(sourceDir, "package.json");
    const originalPackageJson = `${JSON.stringify(
      {
        dependencies: { "@hanzo/bot-ai": "workspace:*", "dep-a": "1.2.3" },
        files: ["dist"],
        name: "bot",
        version: "2026.6.17",
      },
      null,
      2,
    )}\n`;
    const installedAiPath = path.join(sourceDir, "node_modules", "@bot", "ai");
    fs.mkdirSync(path.join(sourceDir, "packages", "ai"), { recursive: true });
    fs.writeFileSync(path.join(sourceDir, "packages", "ai", "package.json"), "{}\n");
    fs.mkdirSync(installedAiPath, { recursive: true });
    fs.writeFileSync(path.join(installedAiPath, "original-marker"), "workspace package");
    fs.writeFileSync(packageJsonPath, originalPackageJson);

    try {
      const cleanup = await prepareBundledAiRuntimePackage(
        sourceDir,
        outputDir,
        async (command: string, args: string[], cwd: string) => {
          expect({ args, command, cwd }).toEqual({
            args: ["--dir", "packages/ai", "pack", "--silent", "--pack-destination", outputDir],
            command: "pnpm",
            cwd: sourceDir,
          });
          fs.writeFileSync(path.join(outputDir, "bot-ai-2026.6.17.tgz"), "ai package");
          return "";
        },
        {
          extractAiRuntime: async (_tarballPath: string, destination: string) => {
            fs.writeFileSync(
              path.join(destination, "package.json"),
              `${JSON.stringify({
                dependencies: { "dep-a": "1.2.3" },
                name: "@hanzo/bot-ai",
                version: "2026.6.17",
              })}\n`,
            );
            fs.writeFileSync(path.join(destination, "runtime.js"), "export {};\n");
          },
        },
      );

      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as {
        bundleDependencies: string[];
        dependencies: Record<string, string>;
      };
      expect(packageJson.dependencies["@hanzo/bot-ai"]).toBe("2026.6.17");
      expect(packageJson.bundleDependencies).toContain("@hanzo/bot-ai");
      expect(fs.existsSync(path.join(installedAiPath, "original-marker"))).toBe(false);
      expect(fs.existsSync(path.join(installedAiPath, "runtime.js"))).toBe(true);
      const stagedAiPackageJson = JSON.parse(
        fs.readFileSync(path.join(installedAiPath, "package.json"), "utf8"),
      ) as { dependencies?: Record<string, string> };
      expect(stagedAiPackageJson.dependencies).toBeUndefined();

      await cleanup();
      expect(fs.readFileSync(packageJsonPath, "utf8")).toBe(originalPackageJson);
      expect(fs.readFileSync(path.join(installedAiPath, "original-marker"), "utf8")).toBe(
        "workspace package",
      );
      expect(fs.existsSync(path.join(outputDir, "bot-ai-2026.6.17.tgz"))).toBe(false);
    } finally {
      fs.rmSync(sourceDir, { recursive: true, force: true });
      fs.rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it("leaves pre-AI-workspace package sources unchanged", async () => {
    const sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), "bot-docker-legacy-source-"));
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "bot-docker-legacy-output-"));
    const packageJsonPath = path.join(sourceDir, "package.json");
    const originalPackageJson = `${JSON.stringify({
      dependencies: { "dep-a": "1.2.3" },
      name: "bot",
      version: "2026.7.1",
    })}\n`;
    fs.writeFileSync(packageJsonPath, originalPackageJson);
    const runCapture = vi.fn();

    try {
      const cleanup = await prepareBundledAiRuntimePackage(sourceDir, outputDir, runCapture);

      expect(runCapture).not.toHaveBeenCalled();
      expect(fs.readFileSync(packageJsonPath, "utf8")).toBe(originalPackageJson);
      await cleanup();
    } finally {
      fs.rmSync(sourceDir, { recursive: true, force: true });
      fs.rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it("rejects incomplete AI workspace package sources", async () => {
    const cases = [
      {
        dependencies: { "@hanzo/bot-ai": "workspace:*" },
        expected: "@hanzo/bot-ai dependency requires the packages/ai workspace",
        withWorkspace: false,
      },
      {
        dependencies: {},
        expected: "root package.json must declare @hanzo/bot-ai as a dependency",
        withWorkspace: true,
      },
    ];

    for (const testCase of cases) {
      const sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), "bot-docker-invalid-source-"));
      const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "bot-docker-invalid-output-"));
      fs.writeFileSync(
        path.join(sourceDir, "package.json"),
        `${JSON.stringify({ dependencies: testCase.dependencies, name: "bot" })}\n`,
      );
      if (testCase.withWorkspace) {
        fs.mkdirSync(path.join(sourceDir, "packages", "ai"), { recursive: true });
        fs.writeFileSync(path.join(sourceDir, "packages", "ai", "package.json"), "{}\n");
      }

      try {
        await expect(prepareBundledAiRuntimePackage(sourceDir, outputDir, vi.fn())).rejects.toThrow(
          testCase.expected,
        );
      } finally {
        fs.rmSync(sourceDir, { recursive: true, force: true });
        fs.rmSync(outputDir, { recursive: true, force: true });
      }
    }
  });

  it("trims and restores the changelog around ignore-scripts package artifacts", async () => {
    const calls: string[] = [];
    const tarball = await packBotPackageForDocker("/repo", "/out", {
      prepareBundledAiRuntime: skipBundledAiRuntime,
      prepareChangelog: async (cwd: string) => {
        calls.push(`prepare:${cwd}`);
      },
      restoreChangelog: async (cwd: string) => {
        calls.push(`restore:${cwd}`);
      },
      runCaptureImpl: async (
        command: string,
        args: string[],
        cwd: string,
        options: { deferForwardedSignalExit?: boolean },
      ) => {
        calls.push(`${command}:${args.join(" ")}:${cwd}`);
        expect(options.deferForwardedSignalExit).toBe(true);
        return "bot-2026.5.28.tgz\n";
      },
    });

    expect(tarball).toBe(path.join("/out", "bot-2026.5.28.tgz"));
    expect(calls).toEqual([
      "prepare:/repo",
      "npm:pack --silent --ignore-scripts --pack-destination /out:/repo",
      "restore:/repo",
    ]);
  });

  it("packages Unreleased notes for explicitly non-publish stable artifacts", async () => {
    const sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), "bot-unreleased-package-"));
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "bot-unreleased-output-"));
    const sourceChangelog = [
      "# Changelog",
      "",
      "## Unreleased",
      "### Fixes",
      "- Pending release notes with enough detail.",
      "",
      "## 2026.5.28",
      "- Previous release notes with enough detail.",
      "",
    ].join("\n");
    fs.writeFileSync(
      path.join(sourceDir, "package.json"),
      '{"name":"bot","version":"2026.5.29"}\n',
    );
    fs.writeFileSync(path.join(sourceDir, "CHANGELOG.md"), sourceChangelog);

    try {
      const tarball = await packBotPackageForDocker(sourceDir, outputDir, {
        allowUnreleasedChangelog: true,
        prepareBundledAiRuntime: skipBundledAiRuntime,
        runCaptureImpl: async () => {
          const packagedChangelog = fs.readFileSync(path.join(sourceDir, "CHANGELOG.md"), "utf8");
          expect(packagedChangelog).toContain("## Unreleased");
          expect(packagedChangelog).not.toContain("## 2026.5.28");
          const packedPath = path.join(outputDir, "bot-2026.5.29.tgz");
          fs.writeFileSync(packedPath, "package");
          return "bot-2026.5.29.tgz\n";
        },
      });

      expect(tarball).toBe(path.join(outputDir, "bot-2026.5.29.tgz"));
      expect(fs.readFileSync(path.join(sourceDir, "CHANGELOG.md"), "utf8")).toBe(sourceChangelog);
    } finally {
      fs.rmSync(sourceDir, { recursive: true, force: true });
      fs.rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it("uses pnpm pack when requested", async () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "bot-pnpm-pack-"));
    const calls: string[] = [];
    const packedPath = path.join(outputDir, "bot-2026.5.28.tgz");

    try {
      const tarball = await packBotPackageForDocker("/repo", outputDir, {
        pnpmPack: true,
        prepareBundledAiRuntime: skipBundledAiRuntime,
        prepareChangelog: async () => {},
        restoreChangelog: async () => {},
        runCaptureImpl: async (command: string, args: string[], cwd: string) => {
          calls.push(`${command}:${args.join(" ")}:${cwd}`);
          fs.writeFileSync(packedPath, "package");
          return `${packedPath}\n`;
        },
      });

      expect(tarball).toBe(packedPath);
      expect(calls).toEqual([
        `pnpm:pack --silent --config.ignore-scripts=true --pack-destination ${outputDir}:/repo`,
      ]);
    } finally {
      fs.rmSync(outputDir, { force: true, recursive: true });
    }
  });

  it("writes npm pack metadata for renamed package artifacts", async () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "bot-docker-pack-json-"));
    const packJsonPath = path.join(outputDir, "pack.json");

    try {
      const tarball = await packBotPackageForDocker("/repo", outputDir, {
        outputName: "bot-current.tgz",
        packJsonPath,
        prepareBundledAiRuntime: skipBundledAiRuntime,
        prepareChangelog: async () => {},
        restoreChangelog: async () => {},
        runCaptureImpl: async (
          command: string,
          args: string[],
          _cwd: string,
          options: { deferForwardedSignalExit?: boolean },
        ) => {
          expect(command).toBe("npm");
          expect(args).toEqual([
            "pack",
            "--json",
            "--silent",
            "--ignore-scripts",
            "--pack-destination",
            outputDir,
          ]);
          expect(options.deferForwardedSignalExit).toBe(true);
          fs.writeFileSync(path.join(outputDir, "bot-2026.5.28.tgz"), "package");
          return JSON.stringify([
            {
              entryCount: 1,
              filename: "bot-2026.5.28.tgz",
              size: 7,
              unpackedSize: 7,
              version: "2026.5.28",
            },
          ]);
        },
      });

      expect(tarball).toBe(path.join(outputDir, "bot-current.tgz"));
      expect(JSON.parse(fs.readFileSync(packJsonPath, "utf8"))).toEqual([
        {
          entryCount: 1,
          filename: "bot-current.tgz",
          size: 7,
          unpackedSize: 7,
          version: "2026.5.28",
        },
      ]);
    } finally {
      fs.rmSync(outputDir, { force: true, recursive: true });
    }
  });

  it("rejects path-like npm pack stdout before resolving Docker package tarballs", async () => {
    for (const filename of [
      "../bot-2026.6.17.tgz",
      "/tmp/bot-2026.6.17.tgz",
      String.raw`C:\temp\bot-2026.6.17.tgz`,
      "bot-nested/evil.tgz",
      String.raw`bot-nested\evil.tgz`,
      "bot-C:evil.tgz",
    ]) {
      await expect(
        packBotPackageForDocker("/repo", "/out", {
          prepareBundledAiRuntime: skipBundledAiRuntime,
          prepareChangelog: async () => {},
          restoreChangelog: async () => {},
          runCaptureImpl: async () => `${filename}\n`,
        }),
      ).rejects.toThrow("npm pack reported unsafe Bot tarball filename");
    }
  });

  it("ignores unsafe output directory tarball names when npm stdout is not usable", async () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "bot-docker-pack-"));
    try {
      if (process.platform === "win32") {
        const nestedDir = path.join(outputDir, "bot-nested");
        fs.mkdirSync(nestedDir);
        fs.writeFileSync(path.join(nestedDir, "evil.tgz"), "");
      } else {
        fs.writeFileSync(path.join(outputDir, "bot-C:evil.tgz"), "");
        fs.writeFileSync(path.join(outputDir, String.raw`bot-nested\evil.tgz`), "");
      }
      await expect(
        packBotPackageForDocker("/repo", outputDir, {
          prepareBundledAiRuntime: skipBundledAiRuntime,
          prepareChangelog: async () => {},
          restoreChangelog: async () => {},
          runCaptureImpl: async () => "npm notice\n",
        }),
      ).rejects.toThrow("missing packed Bot tarball");

      await expect(
        packBotPackageForDocker("/repo", outputDir, {
          prepareBundledAiRuntime: skipBundledAiRuntime,
          prepareChangelog: async () => {},
          restoreChangelog: async () => {},
          runCaptureImpl: async () => {
            fs.writeFileSync(path.join(outputDir, "bot-2026.6.17.tgz"), "");
            return "npm notice\n";
          },
        }),
      ).resolves.toBe(path.join(outputDir, "bot-2026.6.17.tgz"));
    } finally {
      fs.rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it("ignores stale package tarballs before fallback scanning npm output", async () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "bot-docker-pack-stale-"));
    try {
      fs.writeFileSync(path.join(outputDir, "bot-9999.1.1.tgz"), "stale");

      await expect(
        packBotPackageForDocker("/repo", outputDir, {
          prepareBundledAiRuntime: skipBundledAiRuntime,
          prepareChangelog: async () => {},
          restoreChangelog: async () => {},
          runCaptureImpl: async () => {
            fs.writeFileSync(path.join(outputDir, "bot-2026.6.17.tgz"), "current");
            return "npm notice\n";
          },
        }),
      ).resolves.toBe(path.join(outputDir, "bot-2026.6.17.tgz"));

      expect(fs.existsSync(path.join(outputDir, "bot-9999.1.1.tgz"))).toBe(false);
      expect(fs.readFileSync(path.join(outputDir, "bot-2026.6.17.tgz"), "utf8")).toBe(
        "current",
      );
    } finally {
      fs.rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it("restores the changelog when ignore-scripts packaging fails", async () => {
    const calls: string[] = [];

    await expect(
      packBotPackageForDocker("/repo", "/out", {
        prepareBundledAiRuntime: async () => {
          calls.push("embed");
          return async () => {
            calls.push("cleanup");
          };
        },
        prepareChangelog: async (cwd: string) => {
          calls.push(`prepare:${cwd}`);
        },
        restoreChangelog: async (cwd: string) => {
          calls.push(`restore:${cwd}`);
        },
        runCaptureImpl: async () => {
          calls.push("pack");
          throw new Error("pack failed");
        },
      }),
    ).rejects.toThrow("pack failed");

    expect(calls).toEqual(["prepare:/repo", "embed", "pack", "cleanup", "restore:/repo"]);
  });

  it("clamps oversized command timers before scheduling", async () => {
    await expect(
      runCommandForTest(
        process.execPath,
        ["-e", "setTimeout(() => process.exit(0), 25);"],
        process.cwd(),
        {
          killAfterMs: MAX_TIMER_TIMEOUT_MS + 1,
          timeoutMs: MAX_TIMER_TIMEOUT_MS + 1,
        },
      ),
    ).resolves.toBe("");
  });

  it("kills timed-out child process groups", async () => {
    if (process.platform === "win32") {
      return;
    }

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bot-package-timeout-"));
    const childPidPath = path.join(tempDir, "child.pid");
    let childPid;
    try {
      const childScript = ["process.on('SIGTERM', () => {});", "setInterval(() => {}, 1000);"].join(
        "",
      );
      const parentScript = [
        "const { spawn } = require('node:child_process');",
        "const fs = require('node:fs');",
        `const child = spawn(process.execPath, ['-e', ${JSON.stringify(childScript)}], { stdio: 'ignore' });`,
        "fs.writeFileSync(process.env.BOT_TEST_CHILD_PID, String(child.pid));",
        "process.on('SIGTERM', () => {});",
        "setInterval(() => {}, 1000);",
      ].join("");

      const runPromise = runCommandForTest(process.execPath, ["-e", parentScript], process.cwd(), {
        env: { ...process.env, BOT_TEST_CHILD_PID: childPidPath },
        killAfterMs: 25,
        timeoutMs: 500,
      });
      const timeoutAssertion = expect(runPromise).rejects.toThrow(/timed out after 500ms/u);
      childPid = await readPid(childPidPath, 2000);
      await timeoutAssertion;
      await waitForDead(childPid, 2000);
    } finally {
      if (childPid && isProcessAlive(childPid)) {
        process.kill(childPid, "SIGKILL");
      }
      fs.rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it("clamps oversized kill grace before scheduling", async () => {
    if (process.platform === "win32") {
      return;
    }

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bot-package-grace-"));
    const donePath = path.join(tempDir, "done");
    const childPidPath = path.join(tempDir, "child.pid");
    let childPid;
    try {
      const script = [
        "const fs = require('node:fs');",
        `fs.writeFileSync(${JSON.stringify(childPidPath)}, String(process.pid));`,
        "process.on('SIGTERM', () => {",
        `  setTimeout(() => { fs.writeFileSync(${JSON.stringify(donePath)}, 'done'); process.exit(0); }, 75);`,
        "});",
        "setInterval(() => {}, 1000);",
      ].join("\n");

      const runPromise = runCommandForTest(process.execPath, ["-e", script], process.cwd(), {
        killAfterMs: MAX_TIMER_TIMEOUT_MS + 1,
        timeoutMs: 500,
      });
      childPid = await readPid(childPidPath, 2000);

      await expect(runPromise).rejects.toThrow(/timed out after 500ms/u);
      expect(fs.readFileSync(donePath, "utf8")).toBe("done");
    } finally {
      if (childPid && isProcessAlive(childPid)) {
        process.kill(childPid, "SIGKILL");
      }
      fs.rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it("keeps fallback SIGKILL armed for descendants after the direct child exits", async () => {
    if (process.platform === "win32") {
      return;
    }

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bot-package-descendant-"));
    const childPidPath = path.join(tempDir, "child.pid");
    let childPid;
    try {
      const childScript = ["process.on('SIGTERM', () => {});", "setInterval(() => {}, 1000);"].join(
        "",
      );
      const parentScript = [
        "const { spawn } = require('node:child_process');",
        "const fs = require('node:fs');",
        `const child = spawn(process.execPath, ['-e', ${JSON.stringify(childScript)}], { stdio: 'ignore' });`,
        "fs.writeFileSync(process.env.BOT_TEST_CHILD_PID, String(child.pid));",
        "setInterval(() => {}, 1000);",
      ].join("");

      await expect(
        runCommandForTest(process.execPath, ["-e", parentScript], process.cwd(), {
          env: { ...process.env, BOT_TEST_CHILD_PID: childPidPath },
          killAfterMs: 25,
          timeoutMs: 500,
        }),
      ).rejects.toThrow(/timed out after 500ms/u);

      childPid = await readPid(childPidPath, 2000);
      await waitForDead(childPid, 2000);
    } finally {
      if (childPid && isProcessAlive(childPid)) {
        process.kill(childPid, "SIGKILL");
      }
      fs.rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it("does not fire delayed SIGKILL after a timed-out child exits during grace", async () => {
    if (process.platform === "win32") {
      return;
    }

    const killSpy = vi.spyOn(process, "kill");
    try {
      const script = [
        "process.on('SIGTERM', () => process.exit(0));",
        "setInterval(() => {}, 1000);",
      ].join("");

      await expect(
        runCommandForTest(process.execPath, ["-e", script], process.cwd(), {
          killAfterMs: 100,
          timeoutMs: 25,
        }),
      ).rejects.toThrow(/timed out after 25ms/u);

      const sigkillCallsAfterExit = killSpy.mock.calls.filter(
        ([, signal]) => signal === "SIGKILL",
      ).length;
      await sleep(150);
      expect(killSpy.mock.calls.filter(([, signal]) => signal === "SIGKILL")).toHaveLength(
        sigkillCallsAfterExit,
      );
    } finally {
      killSpy.mockRestore();
    }
  });

  it("fails captured commands that exceed the stdout limit", async () => {
    const script = [
      "process.stdout.write('x'.repeat(2048));",
      "process.on('SIGTERM', () => {});",
      "setInterval(() => {}, 1000);",
    ].join("");

    await expect(
      runCommandForTest(process.execPath, ["-e", script], process.cwd(), {
        captureStdout: true,
        killAfterMs: 50,
        maxCapturedStdoutBytes: 1024,
        timeoutMs: 5000,
      }),
    ).rejects.toThrow(/exceeded captured stdout limit \(1024 bytes\)/u);
  });

  it("forwards external termination to active child process groups", async () => {
    if (process.platform === "win32") {
      return;
    }

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bot-package-signal-"));
    const childPidPath = path.join(tempDir, "child.pid");
    const scriptUrl = pathToFileURL(path.resolve("scripts/package-bot-for-docker.mjs")).href;
    let childPid = 0;
    let runnerPid;
    try {
      const childScript = "setInterval(() => {}, 1000);";
      const parentScript = [
        "const { spawn } = require('node:child_process');",
        "const fs = require('node:fs');",
        `const child = spawn(process.execPath, ['-e', ${JSON.stringify(childScript)}], { stdio: 'ignore' });`,
        "fs.writeFileSync(process.env.BOT_TEST_CHILD_PID, String(child.pid));",
        "setInterval(() => {}, 1000);",
      ].join("");
      const runnerScript = [
        `import { runCommandForTest } from ${JSON.stringify(scriptUrl)};`,
        `await runCommandForTest(process.execPath, ['-e', ${JSON.stringify(parentScript)}], process.cwd(), { timeoutMs: 60000 });`,
      ].join("\n");
      const runner = spawn(process.execPath, ["--input-type=module", "-e", runnerScript], {
        cwd: process.cwd(),
        env: { ...process.env, BOT_TEST_CHILD_PID: childPidPath },
        stdio: ["ignore", "ignore", "pipe"],
      });
      runnerPid = runner.pid ?? 0;

      childPid = await readPid(childPidPath, 2000);
      runner.kill("SIGTERM");
      const result = await waitForExit(runner, 5000);

      expect(result).toEqual({ signal: null, status: 143 });
      await waitForDead(childPid, 2000);
    } finally {
      if (runnerPid && isProcessAlive(runnerPid)) {
        process.kill(runnerPid, "SIGKILL");
      }
      if (childPid && isProcessAlive(childPid)) {
        process.kill(childPid, "SIGKILL");
      }
      fs.rmSync(tempDir, { force: true, recursive: true });
    }
  });
});
