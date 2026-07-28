import type { ChildProcess } from "node:child_process";
import type { RespawnChildRuntime } from "./process/respawn-child-runner.js";
import "./entry.compile-cache.js";

type CompileCacheParams = {
  env?: NodeJS.ProcessEnv;
  installRoot: string;
  nodeVersion?: string;
  platform?: NodeJS.Platform;
};

type CompileCacheRespawnPlan = {
  command: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  detachForProcessTree: boolean;
};

type CompileCacheTestApi = {
  buildBotCompileCacheRespawnPlan(params: {
    currentFile: string;
    env?: NodeJS.ProcessEnv;
    execArgv?: string[];
    execPath?: string;
    installRoot: string;
    argv?: string[];
    compileCacheDir?: string;
    nodeVersion?: string;
    platform?: NodeJS.Platform;
  }): CompileCacheRespawnPlan | undefined;
  isNodeVersionAffectedByCompileCacheDeadlock(nodeVersion: string | undefined): boolean;
  isSourceCheckoutInstallRoot(installRoot: string): boolean;
  resolveBotCompileCacheDirectory(params: {
    env?: NodeJS.ProcessEnv;
    installRoot: string;
  }): string;
  runBotCompileCacheRespawnPlan(
    plan: CompileCacheRespawnPlan,
    runtime?: RespawnChildRuntime & { writeError(message: string): void },
  ): ChildProcess;
  shouldEnableBotCompileCache(params: CompileCacheParams): boolean;
};

function getTestApi(): CompileCacheTestApi {
  return (globalThis as Record<PropertyKey, unknown>)[
    Symbol.for("bot.entryCompileCacheTestApi")
  ] as CompileCacheTestApi;
}

export function buildBotCompileCacheRespawnPlan(
  params: Parameters<CompileCacheTestApi["buildBotCompileCacheRespawnPlan"]>[0],
): CompileCacheRespawnPlan | undefined {
  return getTestApi().buildBotCompileCacheRespawnPlan(params);
}

export function isNodeVersionAffectedByCompileCacheDeadlock(
  nodeVersion: string | undefined,
): boolean {
  return getTestApi().isNodeVersionAffectedByCompileCacheDeadlock(nodeVersion);
}

export function isSourceCheckoutInstallRoot(installRoot: string): boolean {
  return getTestApi().isSourceCheckoutInstallRoot(installRoot);
}

export function resolveBotCompileCacheDirectory(
  params: Parameters<CompileCacheTestApi["resolveBotCompileCacheDirectory"]>[0],
): string {
  return getTestApi().resolveBotCompileCacheDirectory(params);
}

export function runBotCompileCacheRespawnPlan(
  ...args: Parameters<CompileCacheTestApi["runBotCompileCacheRespawnPlan"]>
): ChildProcess {
  return getTestApi().runBotCompileCacheRespawnPlan(...args);
}

export function shouldEnableBotCompileCache(params: CompileCacheParams): boolean {
  return getTestApi().shouldEnableBotCompileCache(params);
}
