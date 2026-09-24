/**
 * bot-runs.ts — a bot run: one of the org's bots doing one task on a computer of
 * its own, which is a sandbox leased from cloud as the caller who asked for it.
 *
 * THE RECORD IS THE STORE LIST AND STOP ALREADY READ. A run is the session entry
 * tenants/{org}/agents/{bot}/sessions/sessions.json holds under its run id, so
 * GET /v1/bots and POST /v1/bots/:runId/stop see a launched run with no second
 * registry to agree with. The path is derived from the org, so a run can only ever
 * be filed, found or removed under the tenant that owns it.
 *
 * STATUS IS WHAT THE RUN'S EVENTS SAY. The driver emits one event per transition —
 *
 *   booting   the record exists and a sandbox is being leased
 *   running   the lease answered: the sandbox is up and the bot is started in it
 *   succeeded | failed | stopped   the bot exited, or was halted, and its
 *             sandbox has been released
 *
 * — and `record` is the ONLY writer of `run.status`, applying them in order. The
 * same event then goes to the bus as `bot.run.<status>`. Nothing asks the sandbox
 * how it is doing: the lease answering IS `running`, the exec answering IS the
 * outcome. A run whose record says booting or running but whose driver is not
 * this process is reported `lost` — it is a fact about the record, not a probe.
 *
 * THE BOT IS THE RUNTIME'S ONE AGENT TABLE. What runs is TOOLS.dev (coding-task.ts),
 * the same argv every sandbox runner here reads, so there is no second answer to
 * "what does a bot run". A `desktop` run leases the class with a screen, and the
 * image puts DISPLAY in the environment, so a browser the bot opens is a window.
 */

import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { loadSessionStore, updateSessionStore } from "../config/sessions.js";
import type { SessionEntry, SessionRun } from "../config/sessions/types.js";
import { resolveTenantSessionStorePath, resolveTenantStateDir } from "../config/tenant-paths.js";
import { type Bus, connectBus, parseBusUrl } from "../infra/bus.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { isCronRunSessionKey } from "../sessions/session-key-utils.js";
import { cloudSandboxes, type SandboxCaller, type Sandboxes } from "./cloud-sandbox.js";
import { TOOLS } from "./coding-task.js";

export const BOT_RUN_SURFACES = ["desktop", "terminal"] as const;
export type BotRunSurface = (typeof BOT_RUN_SURFACES)[number];
export type BotRunStatus = SessionRun["status"];
/** What a reader is told: the recorded status, or `lost` for a live one nobody drives. */
export type BotRunState = BotRunStatus | "lost";

/** The longest a run may take: cloud's longest single command (SANDBOX_EXEC_TIMEOUT_SEC). */
export const MAX_RUN_SECONDS = 900;
export const MIN_RUN_SECONDS = 60;
/**
 * A lease outlives its run by this much — the boot before it and the release after
 * it — so the lease TTL is the backstop that ends a sandbox whose driver died.
 */
const LEASE_MARGIN_SECONDS = 300;
/**
 * Live runs one org may hold here. Each is a sandbox on cloud's nodes; past this
 * the answer is "wait", and it is given before anything is leased.
 */
export const MAX_LIVE_RUNS_PER_ORG = 8;
const ERROR_CAP = 1_000;

/** This process. A live run recorded under another boot has no driver. */
const BOOT = randomUUID();

// Reserved session keys that are never bot runs.
const RESERVED_KEYS = new Set(["global", "unknown"]);

export type BotRunView = {
  runId: string;
  bot: string;
  task: string;
  surface: BotRunSurface;
  status: BotRunState;
  sandboxId?: string;
  exitCode?: number;
  error?: string;
  startedAt: string;
  endedAt?: string;
};

/**
 * One transition. `task` and `error` are the tenant's words and output; they are
 * written to the tenant's own record and never published — the bus is a
 * cluster-wide listener, and it carries identities and states only.
 */
export type BotRunEvent = {
  org: string;
  runId: string;
  bot: string;
  surface: BotRunSurface;
  status: BotRunStatus;
  sandboxId?: string;
  exitCode?: number;
  at: number;
  task?: string;
  error?: string;
};

export type LaunchRequest = {
  caller: SandboxCaller;
  bot: string;
  task: string;
  surface: BotRunSurface;
  timeoutSec: number;
};

/** The org already holds MAX_LIVE_RUNS_PER_ORG live runs. */
export class BotRunsBusy extends Error {}

export type BotRunsDeps = {
  sandboxes: Sandboxes;
  bus: Bus;
  log?: (message: string) => void;
  env?: NodeJS.ProcessEnv;
};

type Live = { org: string; halt: AbortController; settled: Promise<void> };

export class BotRuns {
  private readonly live = new Map<string, Live>();
  private readonly chains = new Map<string, Promise<void>>();
  private readonly log: (message: string) => void;

  constructor(private readonly deps: BotRunsDeps) {
    this.log = deps.log ?? (() => {});
  }

  /**
   * Launch records the run as booting, starts its driver, and answers — it never
   * waits for the sandbox. What happens next arrives as events.
   */
  async launch(req: LaunchRequest): Promise<BotRunView> {
    const org = req.caller.org;
    let held = 0;
    for (const l of this.live.values()) {
      if (l.org === org) {
        held++;
      }
    }
    if (held >= MAX_LIVE_RUNS_PER_ORG) {
      throw new BotRunsBusy(
        `this org already has ${held} live bot runs (max ${MAX_LIVE_RUNS_PER_ORG}); stop one or wait for one to finish`,
      );
    }
    const runId = `run_${randomUUID().replaceAll("-", "")}`;
    const at = Date.now();
    const base = { org, runId, bot: req.bot, surface: req.surface };
    // The slot is taken in the same turn as the count, before anything awaits, so
    // launches that arrive together cannot all see room for one more.
    const halt = new AbortController();
    const live: Live = { org, halt, settled: Promise.resolve() };
    this.live.set(key(org, runId), live);
    try {
      // The record exists before anything is spent: a launch that cannot be
      // written leases nothing.
      await this.emit({ ...base, status: "booting", at, task: req.task });
    } catch (err) {
      this.live.delete(key(org, runId));
      throw err;
    }
    live.settled = this.drive(req, runId, halt.signal).finally(() => {
      this.live.delete(key(org, runId));
    });
    return {
      runId,
      bot: req.bot,
      task: req.task,
      surface: req.surface,
      status: "booting",
      startedAt: new Date(at).toISOString(),
    };
  }

  /** The org's runs, as their records say. */
  list(org: string): BotRunView[] {
    const out: BotRunView[] = [];
    for (const storePath of tenantStorePaths(org, this.deps.env)) {
      const store = loadSessionStore(storePath, { skipCache: true });
      for (const [runId, entry] of Object.entries(store)) {
        // A run is an entry a launch filed, and only that.
        if (isRunKey(runId) && entry?.run) {
          out.push(toView(runId, entry, entry.run));
        }
      }
    }
    return out;
  }

  /**
   * Stop halts the run if this process drives it — its sandbox is released and the
   * stopped event follows — and removes it from the org's list. A live run no
   * process drives (lost) has nobody to release its sandbox, so stop ends it, as
   * the caller. False when the org holds no such run.
   */
  async stop(caller: SandboxCaller, runId: string): Promise<boolean> {
    if (!isRunKey(runId)) {
      return false;
    }
    const { org } = caller;
    const live = this.live.get(key(org, runId));
    live?.halt.abort();
    let removed: SessionRun | null = null;
    for (const storePath of tenantStorePaths(org, this.deps.env)) {
      removed = await updateSessionStore(storePath, (store) => {
        // hasOwnProperty, so a run id naming an Object.prototype member cannot
        // resolve to an inherited value and report a stop for a run that never was.
        const run = Object.prototype.hasOwnProperty.call(store, runId)
          ? store[runId]?.run
          : undefined;
        if (!run) {
          return null;
        }
        delete store[runId];
        return run;
      });
      if (removed) {
        break;
      }
    }
    const orphan =
      !live && removed?.sandboxId && (removed.status === "booting" || removed.status === "running");
    if (orphan) {
      await this.deps.sandboxes.end(caller, removed!.sandboxId!).catch((err: unknown) => {
        this.log(
          `bot run ${runId}: lost run's sandbox ${removed!.sandboxId} not released: ${errText(err)}`,
        );
      });
    }
    return removed !== null || live !== undefined;
  }

  /** Resolves once every run this process drives has settled. */
  async settled(): Promise<void> {
    await Promise.allSettled([...this.live.values()].map((l) => l.settled));
    await Promise.allSettled(this.chains.values());
  }

  private async drive(req: LaunchRequest, runId: string, halted: AbortSignal): Promise<void> {
    const { caller } = req;
    const base = { org: caller.org, runId, bot: req.bot, surface: req.surface };
    let sandboxId: string | undefined;
    let outcome: Omit<BotRunEvent, keyof typeof base | "at">;
    try {
      if (halted.aborted) {
        throw halted.reason; // stopped before its sandbox was asked for
      }
      // The lease is not handed the halt signal: a lease cut mid-flight may still
      // produce a sandbox we would never learn the id of, and so could never end.
      sandboxId = await this.deps.sandboxes.lease(caller, {
        cls: req.surface === "desktop" ? "desktop" : "dev",
        ttlSec: req.timeoutSec + LEASE_MARGIN_SECONDS,
      });
      if (halted.aborted) {
        throw halted.reason;
      }
      await this.emit({ ...base, status: "running", sandboxId, at: Date.now() });
      const done = await this.deps.sandboxes.exec(
        caller,
        sandboxId,
        TOOLS.dev(req.task),
        req.timeoutSec,
        halted,
      );
      outcome =
        done.exitCode === 0
          ? { status: "succeeded", sandboxId, exitCode: 0 }
          : {
              status: "failed",
              sandboxId,
              exitCode: done.exitCode,
              error: bound(done.stderr.trim() || done.stdout.trim() || `exit ${done.exitCode}`),
            };
    } catch (err) {
      outcome = halted.aborted
        ? { status: "stopped", sandboxId }
        : { status: "failed", sandboxId, error: bound(errText(err)) };
    }
    // Released BEFORE the terminal event, so a terminal event means the compute is
    // gone. A release that fails is left to the lease's own TTL, and said.
    if (sandboxId) {
      await this.deps.sandboxes.end(caller, sandboxId).catch((err: unknown) => {
        this.log(`bot run ${runId}: sandbox ${sandboxId} not released: ${errText(err)}`);
      });
    }
    // emit logs a record it could not write; the driver itself never rejects.
    await this.emit({ ...base, ...outcome, at: Date.now() }).catch(() => {});
  }

  /**
   * emit applies one event to the run's record and then publishes it, in order per
   * run. It resolves once the record holds it; a record that cannot be written
   * rejects, and the publish does not happen for a state nothing recorded.
   */
  private emit(evt: BotRunEvent): Promise<void> {
    const k = key(evt.org, evt.runId);
    const prior = this.chains.get(k) ?? Promise.resolve();
    const next = prior
      .catch(() => {})
      .then(() => record(evt, this.deps.env))
      .then(() => {
        this.deps.bus.publish(`bot.run.${evt.status}`, published(evt));
      });
    this.chains.set(k, next);
    const forget = () => {
      if (this.chains.get(k) === next) {
        this.chains.delete(k);
      }
    };
    next.then(forget, (err: unknown) => {
      forget();
      this.log(`bot run ${evt.runId}: ${evt.status} not recorded: ${errText(err)}`);
    });
    return next;
  }
}

let shared: BotRuns | null = null;

/** The bus in cluster: cloud's embedded Hanzo PubSub. PUBSUB_URL overrides it. */
export const DEFAULT_BUS_URL = "nats://cloud.hanzo.svc:4222";

/**
 * busUrl is PUBSUB_URL when it names a bus, else the cluster's. An override that
 * is not a nats:// address is said out loud and not used.
 */
export function busUrl(env: NodeJS.ProcessEnv, log: (m: string) => void): string {
  const url = env.PUBSUB_URL?.trim();
  if (!url) {
    return DEFAULT_BUS_URL;
  }
  try {
    parseBusUrl(url);
    return url;
  } catch (err) {
    log(`${errText(err)}; publishing to ${DEFAULT_BUS_URL}`);
    return DEFAULT_BUS_URL;
  }
}

/** botRuns is this process's run plane: cloud's sandboxes and the platform bus. */
export function botRuns(): BotRuns {
  if (shared) {
    return shared;
  }
  const logger = createSubsystemLogger("gateway/bot-runs");
  const log = (m: string) => logger.warn(m);
  const bus = connectBus(busUrl(process.env, log), { name: "bot-gateway", log });
  shared = new BotRuns({ sandboxes: cloudSandboxes(), bus, log });
  return shared;
}

/**
 * record applies one event to the run's entry. `booting` creates it; every later
 * event updates an entry that still exists and never recreates one — a run that
 * was stopped and removed stays removed when its driver's last word arrives.
 */
async function record(evt: BotRunEvent, env?: NodeJS.ProcessEnv): Promise<void> {
  const storePath = resolveTenantSessionStorePath({ orgId: evt.org, userId: "" }, evt.bot, env);
  await updateSessionStore(storePath, (store) => {
    if (evt.status === "booting") {
      store[evt.runId] = {
        sessionId: evt.runId,
        updatedAt: evt.at,
        label: evt.task,
        origin: { provider: "bot", surface: evt.surface },
        run: { bot: evt.bot, status: "booting", boot: BOOT, startedAt: evt.at },
      };
      return;
    }
    if (!Object.prototype.hasOwnProperty.call(store, evt.runId)) {
      return;
    }
    const entry = store[evt.runId];
    if (!entry?.run) {
      return;
    }
    const terminal = evt.status !== "running";
    entry.updatedAt = evt.at;
    entry.run = {
      ...entry.run,
      status: evt.status,
      ...(evt.sandboxId ? { sandboxId: evt.sandboxId } : {}),
      ...(evt.exitCode !== undefined ? { exitCode: evt.exitCode } : {}),
      ...(evt.error ? { error: evt.error } : {}),
      ...(terminal ? { endedAt: evt.at } : {}),
    };
  });
}

/** The bus payload: who and what state, never the tenant's words. */
function published(evt: BotRunEvent): Omit<BotRunEvent, "task" | "error"> {
  const { task: _task, error: _error, ...rest } = evt;
  return rest;
}

function toView(runId: string, entry: SessionEntry, run: SessionRun): BotRunView {
  const live = run.status === "booting" || run.status === "running";
  return {
    runId,
    bot: run.bot,
    task: entry.label ?? "",
    surface: entry.origin?.surface === "terminal" ? "terminal" : "desktop",
    status: live && run.boot !== BOOT ? "lost" : run.status,
    ...(run.sandboxId ? { sandboxId: run.sandboxId } : {}),
    ...(run.exitCode !== undefined ? { exitCode: run.exitCode } : {}),
    ...(run.error ? { error: run.error } : {}),
    startedAt: new Date(run.startedAt).toISOString(),
    ...(run.endedAt ? { endedAt: new Date(run.endedAt).toISOString() } : {}),
  };
}

/**
 * Every sessions.json under the org's tenant tree (one per bot). This is the org
 * boundary: the path is derived from the org, so the scan reaches no other
 * tenant's runs.
 */
function tenantStorePaths(org: string, env?: NodeJS.ProcessEnv): string[] {
  const agentsDir = path.join(resolveTenantStateDir({ orgId: org, userId: "" }, env), "agents");
  let bots: string[];
  try {
    bots = fs
      .readdirSync(agentsDir, { withFileTypes: true })
      .flatMap((e) => (e.isDirectory() ? [e.name] : []));
  } catch {
    return [];
  }
  return bots
    .map((bot) => path.join(agentsDir, bot, "sessions", "sessions.json"))
    .filter((p) => fs.existsSync(p));
}

function isRunKey(k: string): boolean {
  return !RESERVED_KEYS.has(k) && !isCronRunSessionKey(k);
}

function key(org: string, runId: string): string {
  return `${org}\u0000${runId}`;
}

function bound(s: string): string {
  return s.length > ERROR_CAP ? `…${s.slice(-ERROR_CAP)}` : s;
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
