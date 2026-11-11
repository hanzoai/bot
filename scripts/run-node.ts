#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const compiler = "tsdown";
const compilerArgs = ["exec", compiler, "--no-clean"];

export const runNodeWatchedPaths = ["src", "tsconfig.json", "package.json"];

type SpawnProcessLike = {
  on: (event: "exit", cb: (code: number | null, signal: string | null) => void) => unknown;
};

type SpawnFn = (cmd: string, args: string[], options: Record<string, unknown>) => SpawnProcessLike;

type SpawnSyncResultLike = {
  status: number | null;
  stdout?: string | null;
};

type SpawnSyncFn = (
  cmd: string,
  args: string[],
  options: {
    cwd?: string;
    encoding: BufferEncoding;
    stdio?: ["ignore", "pipe", "ignore"];
  },
) => SpawnSyncResultLike;

type FsLike = Pick<
  typeof fs,
  "statSync" | "readdirSync" | "readFileSync" | "mkdirSync" | "writeFileSync"
>;

type RunNodeDeps = {
  spawn: SpawnFn;
  spawnSync: SpawnSyncFn;
  fs: FsLike;
  stderr: { write: (value: string) => unknown };
  execPath: string;
  cwd: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  platform: NodeJS.Platform;
  distRoot: string;
  distEntry: string;
  buildStampPath: string;
  srcRoot: string;
  configFiles: string[];
};

export type RunNodeMainParams = {
  spawn?: SpawnFn;
  spawnSync?: SpawnSyncFn;
  fs?: FsLike;
  stderr?: { write: (value: string) => unknown };
  execPath?: string;
  cwd?: string;
  args?: string[];
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
};

const statMtime = (filePath: string, fsImpl: FsLike = fs): number | null => {
  try {
    return fsImpl.statSync(filePath).mtimeMs;
  } catch {
    return null;
  }
};

const isExcludedSource = (filePath: string, srcRoot: string): boolean => {
  const relativePath = path.relative(srcRoot, filePath);
  if (relativePath.startsWith("..")) {
    return false;
  }
  return (
    relativePath.endsWith(".test.ts") ||
    relativePath.endsWith(".test.tsx") ||
    relativePath.endsWith("test-helpers.ts")
  );
};

const findLatestMtime = (
  dirPath: string,
  shouldSkip: ((candidate: string) => boolean) | undefined,
  deps: RunNodeDeps,
): number | null => {
  let latest: number | null = null;
  const queue = [dirPath];
  while (queue.length > 0) {
    const current = queue.pop();
    if (!current) {
      continue;
    }
    let entries: fs.Dirent[] = [];
    try {
      entries = deps.fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(fullPath);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      if (shouldSkip?.(fullPath)) {
        continue;
      }
      const mtime = statMtime(fullPath, deps.fs);
      if (mtime == null) {
        continue;
      }
      if (latest == null || mtime > latest) {
        latest = mtime;
      }
    }
  }
  return latest;
};

const runGit = (gitArgs: string[], deps: RunNodeDeps): string | null => {
  try {
    const result = deps.spawnSync("git", gitArgs, {
      cwd: deps.cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    if (result.status !== 0) {
      return null;
    }
    return (result.stdout ?? "").trim();
  } catch {
    return null;
  }
};

const resolveGitHead = (deps: RunNodeDeps): string | null => {
  const head = runGit(["rev-parse", "HEAD"], deps);
  return head || null;
};

const hasDirtySourceTree = (deps: RunNodeDeps): boolean | null => {
  const output = runGit(
    ["status", "--porcelain", "--untracked-files=normal", "--", ...runNodeWatchedPaths],
    deps,
  );
  if (output === null) {
    return null;
  }
  return output.length > 0;
};

const readBuildStamp = (deps: RunNodeDeps): { mtime: number | null; head: string | null } => {
  const mtime = statMtime(deps.buildStampPath, deps.fs);
  if (mtime == null) {
    return { mtime: null, head: null };
  }
  try {
    const raw = deps.fs.readFileSync(deps.buildStampPath, "utf8").trim();
    if (!raw.startsWith("{")) {
      return { mtime, head: null };
    }
    const parsed = JSON.parse(raw) as { head?: unknown };
    const head = typeof parsed?.head === "string" && parsed.head.trim() ? parsed.head.trim() : null;
    return { mtime, head };
  } catch {
    return { mtime, head: null };
  }
};

const hasSourceMtimeChanged = (stampMtime: number, deps: RunNodeDeps): boolean => {
  const srcMtime = findLatestMtime(
    deps.srcRoot,
    (candidate) => isExcludedSource(candidate, deps.srcRoot),
    deps,
  );
  return srcMtime != null && srcMtime > stampMtime;
};

const shouldBuild = (deps: RunNodeDeps): boolean => {
  if (deps.env.BOT_FORCE_BUILD === "1") {
    return true;
  }
  const stamp = readBuildStamp(deps);
  if (stamp.mtime == null) {
    return true;
  }
  if (statMtime(deps.distEntry, deps.fs) == null) {
    return true;
  }

  for (const filePath of deps.configFiles) {
    const mtime = statMtime(filePath, deps.fs);
    if (mtime != null && mtime > stamp.mtime) {
      return true;
    }
  }

  const currentHead = resolveGitHead(deps);
  if (currentHead && !stamp.head) {
    return hasSourceMtimeChanged(stamp.mtime, deps);
  }
  if (currentHead && stamp.head && currentHead !== stamp.head) {
    return hasSourceMtimeChanged(stamp.mtime, deps);
  }
  if (currentHead) {
    const dirty = hasDirtySourceTree(deps);
    if (dirty === true) {
      return true;
    }
    if (dirty === false) {
      return false;
    }
  }

  if (hasSourceMtimeChanged(stamp.mtime, deps)) {
    return true;
  }
  return false;
};

const logRunner = (message: string, deps: RunNodeDeps): void => {
  if (deps.env.BOT_RUNNER_LOG === "0") {
    return;
  }
  deps.stderr.write(`[bot] ${message}\n`);
};

const runHanzoBot = async (deps: RunNodeDeps): Promise<number> => {
  const nodeProcess = deps.spawn(deps.execPath, ["bot.mjs", ...deps.args], {
    cwd: deps.cwd,
    env: deps.env,
    stdio: "inherit",
  });
  const res = await new Promise<{ exitCode: number | null; exitSignal: string | null }>(
    (resolve) => {
      nodeProcess.on("exit", (exitCode, exitSignal) => {
        resolve({ exitCode, exitSignal });
      });
    },
  );
  if (res.exitSignal) {
    return 1;
  }
  return res.exitCode ?? 1;
};

const writeBuildStamp = (deps: RunNodeDeps): void => {
  try {
    deps.fs.mkdirSync(deps.distRoot, { recursive: true });
    const stamp = {
      builtAt: Date.now(),
      head: resolveGitHead(deps),
    };
    deps.fs.writeFileSync(deps.buildStampPath, `${JSON.stringify(stamp)}\n`);
  } catch (error) {
    // Best-effort stamp; still allow the runner to start.
    const message = error instanceof Error ? error.message : "unknown error";
    logRunner(`Failed to write build stamp: ${message}`, deps);
  }
};

export async function runNodeMain(params: RunNodeMainParams = {}): Promise<number> {
  const cwd = params.cwd ?? process.cwd();
  const distRoot = path.join(cwd, "dist");
  const deps: RunNodeDeps = {
    spawn: params.spawn ?? spawn,
    spawnSync: params.spawnSync ?? spawnSync,
    fs: params.fs ?? fs,
    stderr: params.stderr ?? process.stderr,
    execPath: params.execPath ?? process.execPath,
    cwd,
    args: params.args ?? process.argv.slice(2),
    env: params.env ? { ...params.env } : { ...process.env },
    platform: params.platform ?? process.platform,
    distRoot,
    distEntry: path.join(distRoot, "/entry.js"),
    buildStampPath: path.join(distRoot, ".buildstamp"),
    srcRoot: path.join(cwd, "src"),
    configFiles: [path.join(cwd, "tsconfig.json"), path.join(cwd, "package.json")],
  };

  if (!shouldBuild(deps)) {
    return await runHanzoBot(deps);
  }

  logRunner("Building TypeScript (dist is stale).", deps);
  const buildCmd = deps.platform === "win32" ? "cmd.exe" : "pnpm";
  const buildArgs =
    deps.platform === "win32" ? ["/d", "/s", "/c", "pnpm", ...compilerArgs] : compilerArgs;
  const build = deps.spawn(buildCmd, buildArgs, {
    cwd: deps.cwd,
    env: deps.env,
    stdio: "inherit",
  });

  const buildRes = await new Promise<{ exitCode: number | null; exitSignal: string | null }>(
    (resolve) => {
      build.on("exit", (exitCode, exitSignal) => resolve({ exitCode, exitSignal }));
    },
  );
  if (buildRes.exitSignal) {
    return 1;
  }
  if (buildRes.exitCode !== 0 && buildRes.exitCode !== null) {
    return buildRes.exitCode;
  }
  writeBuildStamp(deps);
  return await runHanzoBot(deps);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  void runNodeMain()
    .then((code) => process.exit(code))
    .catch((err: unknown) => {
      console.error(err);
      process.exit(1);
    });
}
