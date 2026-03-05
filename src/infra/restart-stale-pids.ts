import { spawnSync } from "node:child_process";
import { resolveGatewayPort } from "../config/paths.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { resolveLsofCommandSync } from "./ports-lsof.js";

const SPAWN_TIMEOUT_MS = 2000;
const STALE_SIGTERM_WAIT_MS = 300;
const STALE_SIGKILL_WAIT_MS = 200;

const PORT_FREE_TIMEOUT_MS = 2000;

const restartLog = createSubsystemLogger("restart");
let sleepSyncOverride: ((ms: number) => void) | null = null;
let dateNowOverride: (() => number) | null = null;

function nowMs(): number {
  return dateNowOverride ? dateNowOverride() : Date.now();
}

function sleepSync(ms: number): void {
  const timeoutMs = Math.max(0, Math.floor(ms));
  if (timeoutMs <= 0) {
    return;
  }
  if (sleepSyncOverride) {
    sleepSyncOverride(timeoutMs);
    return;
  }
  try {
    const lock = new Int32Array(new SharedArrayBuffer(4));
    Atomics.wait(lock, 0, 0, timeoutMs);
  } catch {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      // Best-effort fallback when Atomics.wait is unavailable.
    }
  }
}

/**
 * Find PIDs of gateway processes listening on the given port using synchronous lsof.
 * Returns only PIDs that belong to bot gateway processes (not the current process).
 */
function isGatewayCommand(cmd: string): boolean {
  const lower = cmd.toLowerCase();
  return lower.includes("bot") || lower.includes("openclaw");
}

function parsePidsFromLsofOutput(stdout: string): number[] {
  const pids: number[] = [];
  let currentPid: number | undefined;
  let currentCmd: string | undefined;
  for (const line of stdout.split(/\r?\n/).filter(Boolean)) {
    if (line.startsWith("p")) {
      if (currentPid != null && currentCmd && isGatewayCommand(currentCmd)) {
        pids.push(currentPid);
      }
      const parsed = Number.parseInt(line.slice(1), 10);
      currentPid = Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
      currentCmd = undefined;
    } else if (line.startsWith("c")) {
      currentCmd = line.slice(1);
    }
  }
  if (currentPid != null && currentCmd && isGatewayCommand(currentCmd)) {
    pids.push(currentPid);
  }
  return [...new Set(pids)];
}

export function findGatewayPidsOnPortSync(port: number, spawnTimeoutMs?: number): number[] {
  if (process.platform === "win32") {
    return [];
  }
  const lsof = resolveLsofCommandSync();
  const res = spawnSync(lsof, ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-Fpc"], {
    encoding: "utf8",
    timeout: spawnTimeoutMs ?? SPAWN_TIMEOUT_MS,
  });
  if (res.error) {
    restartLog.warn(`lsof failed during initial stale-pid scan: ${String(res.error)}`);
    return [];
  }
  if (res.status !== 0) {
    if (res.status != null && res.status > 1) {
      restartLog.warn(`lsof exited with status ${res.status}: ${res.stderr || ""}`);
    }
    return [];
  }
  return parsePidsFromLsofOutput(res.stdout).filter((pid) => pid !== process.pid);
}

/**
 * Synchronously terminate stale gateway processes.
 * Sends SIGTERM, waits briefly, then SIGKILL for survivors.
 */
function terminateStaleProcessesSync(pids: number[]): number[] {
  if (pids.length === 0) {
    return [];
  }
  const killed: number[] = [];
  for (const pid of pids) {
    try {
      process.kill(pid, "SIGTERM");
      killed.push(pid);
    } catch {
      // ESRCH — already gone
    }
  }
  if (killed.length === 0) {
    return killed;
  }
  sleepSync(STALE_SIGTERM_WAIT_MS);
  for (const pid of killed) {
    try {
      process.kill(pid, 0);
      process.kill(pid, "SIGKILL");
    } catch {
      // already gone
    }
  }
  sleepSync(STALE_SIGKILL_WAIT_MS);
  return killed;
}

type PollResult = { free: boolean | null; permanent: boolean };

function pollPortOnce(port: number): PollResult {
  try {
    const lsof = resolveLsofCommandSync();
    const res = spawnSync(lsof, ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-Fpc"], {
      encoding: "utf8",
      timeout: SPAWN_TIMEOUT_MS,
    });
    if (res.error) {
      const code = (res.error as NodeJS.ErrnoException).code;
      if (code === "ENOENT" || code === "EACCES" || code === "EPERM") {
        return { free: null, permanent: true };
      }
      return { free: null, permanent: false };
    }
    if (res.status === 1) {
      // status 1 = no matching processes. But check stdout for partial results
      // (Linux container edge case: lsof exits 1 with partial output).
      const gatewayPids = parsePidsFromLsofOutput(res.stdout);
      if (gatewayPids.length > 0) {
        return { free: false, permanent: false };
      }
      return { free: true, permanent: false };
    }
    if (res.status === 0) {
      const gatewayPids = parsePidsFromLsofOutput(res.stdout);
      return { free: gatewayPids.length === 0, permanent: false };
    }
    // status > 1: inconclusive (permission errors, etc.)
    return { free: null, permanent: false };
  } catch {
    return { free: null, permanent: false };
  }
}

function waitForPortFreeSync(port: number): void {
  const deadline = nowMs() + PORT_FREE_TIMEOUT_MS;
  while (nowMs() < deadline) {
    const result = pollPortOnce(port);
    if (result.free === true) {
      return;
    }
    if (result.permanent) {
      restartLog.warn("lsof unavailable (permanent error); skipping port-free wait");
      return;
    }
    sleepSync(100);
  }
  restartLog.warn("port-free wait budget exhausted; proceeding with possible port conflict");
}

/**
 * Inspect the gateway port and kill any stale gateway processes holding it.
 * Called before service restart commands to prevent port conflicts.
 * Polls until the port is confirmed free after killing stale processes.
 */
export function cleanStaleGatewayProcessesSync(): number[] {
  try {
    const port = resolveGatewayPort(undefined, process.env);
    const stalePids = findGatewayPidsOnPortSync(port);
    if (stalePids.length === 0) {
      return [];
    }
    restartLog.warn(
      `killing ${stalePids.length} stale gateway process(es) before restart: ${stalePids.join(", ")}`,
    );
    const killed = terminateStaleProcessesSync(stalePids);
    waitForPortFreeSync(port);
    return killed;
  } catch {
    return [];
  }
}

export const __testing = {
  setSleepSyncOverride(fn: ((ms: number) => void) | null) {
    sleepSyncOverride = fn;
  },
  setDateNowOverride(fn: (() => number) | null) {
    dateNowOverride = fn;
  },
  callSleepSyncRaw(ms: number) {
    const saved = sleepSyncOverride;
    sleepSyncOverride = null;
    try {
      sleepSync(ms);
    } finally {
      sleepSyncOverride = saved;
    }
  },
};
