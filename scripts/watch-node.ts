#!/usr/bin/env node
import { spawn } from "node:child_process";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { runNodeWatchedPaths } from "./run-node.ts";

const WATCH_NODE_RUNNER = "scripts/run-node.ts";

type WatchChildProcess = {
  kill?: (signal?: NodeJS.Signals) => unknown;
  on: (event: "exit", cb: (code: number | null, signal: string | null) => void) => unknown;
};

type WatchSpawnFn = (
  cmd: string,
  args: string[],
  options: Record<string, unknown>,
) => WatchChildProcess;

export type RunWatchMainParams = {
  spawn?: WatchSpawnFn;
  process?: NodeJS.Process;
  cwd?: string;
  args?: string[];
  env?: NodeJS.ProcessEnv;
  now?: () => number;
};

const buildWatchArgs = (args: string[]) => [
  ...runNodeWatchedPaths.flatMap((watchPath) => ["--watch-path", watchPath]),
  "--watch-preserve-output",
  "--experimental-strip-types",
  WATCH_NODE_RUNNER,
  ...args,
];

type WatchDeps = Required<RunWatchMainParams>;

export async function runWatchMain(params: RunWatchMainParams = {}): Promise<number> {
  const deps: WatchDeps = {
    spawn: params.spawn ?? spawn,
    process: params.process ?? process,
    cwd: params.cwd ?? process.cwd(),
    args: params.args ?? process.argv.slice(2),
    env: params.env ? { ...params.env } : { ...process.env },
    now: params.now ?? Date.now,
  };

  const childEnv: NodeJS.ProcessEnv = { ...deps.env };
  const watchSession = `${deps.now()}-${deps.process.pid}`;
  childEnv.BOT_WATCH_MODE = "1";
  childEnv.BOT_WATCH_SESSION = watchSession;
  if (deps.args.length > 0) {
    childEnv.BOT_WATCH_COMMAND = deps.args.join(" ");
  }

  const watchProcess = deps.spawn(deps.process.execPath, buildWatchArgs(deps.args), {
    cwd: deps.cwd,
    env: childEnv,
    stdio: "inherit",
  });

  let settled = false;
  let onSigInt: (() => void) | undefined;
  let onSigTerm: (() => void) | undefined;

  const settle = (resolve: (code: number) => void, code: number): void => {
    if (settled) {
      return;
    }
    settled = true;
    if (onSigInt) {
      deps.process.off("SIGINT", onSigInt);
    }
    if (onSigTerm) {
      deps.process.off("SIGTERM", onSigTerm);
    }
    resolve(code);
  };

  return await new Promise<number>((resolve) => {
    onSigInt = () => {
      if (typeof watchProcess.kill === "function") {
        watchProcess.kill("SIGTERM");
      }
      settle(resolve, 130);
    };
    onSigTerm = () => {
      if (typeof watchProcess.kill === "function") {
        watchProcess.kill("SIGTERM");
      }
      settle(resolve, 143);
    };

    deps.process.on("SIGINT", onSigInt);
    deps.process.on("SIGTERM", onSigTerm);

    watchProcess.on("exit", (code, signal) => {
      if (signal) {
        settle(resolve, 1);
        return;
      }
      settle(resolve, code ?? 1);
    });
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  void runWatchMain()
    .then((code) => process.exit(code))
    .catch((err: unknown) => {
      console.error(err);
      process.exit(1);
    });
}
