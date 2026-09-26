import fs from "node:fs";
import path from "node:path";
import JSON5 from "json5";
import { SAFE_SESSION_ID_RE } from "../../config/sessions/paths.js";
import { convertConfig, listEnvRefs, mergeBeneath } from "./config.js";
import {
  convertAuth,
  convertCronJob,
  convertSessionEntry,
  mergeAuth,
  resetArchiveName,
} from "./convert.js";
import { convertEnvEntries, mergeEnvText, parseEnvEntries } from "./env.js";
import {
  applyActions,
  assertOutsideSource,
  isWithin,
  planCopyTree,
  realPathOf,
  relinkInto,
  type Action,
} from "./files.js";
import { createPathRewriter, homeForm } from "./paths.js";
import { planSkips } from "./skips.js";
import { readOpenClawState, STATE_DB, type OpenClawState } from "./state.js";

/**
 * `hanzo-bot migrate openclaw`: plan (always) and apply (on request). The plan
 * is computed by reading only; applying performs exactly the actions the plan
 * listed, and every write lands inside the target dir.
 */

type Json = Record<string, unknown>;

export type PlanStatus = "create" | "update" | "unchanged" | "conflict";

export type PlanItem = {
  op: "write" | "copy" | "rename" | "drop" | "skip" | "note";
  from: string;
  to?: string;
  status?: PlanStatus;
  reason?: string;
  count?: number;
  names?: string[];
};

export type Plan = { version: 1; source: string; target: string; items: PlanItem[] };

export type MigrationParams = {
  /** The OpenClaw state dir. */
  source: string;
  /** The Hanzo Bot state dir. */
  target: string;
  /** Home dir, for `~/…` paths. */
  home: string;
};

const PRIVATE = 0o600;
const DIRS_COPIED = ["skills", "hooks", "tools", "credentials"] as const;

function isPlainObject(value: unknown): value is Json {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function rel(root: string, file: string): string {
  return path.relative(root, file).split(path.sep).join("/");
}

/** A converted file: create it, merge into what is there, or leave it. */
function planWrite(
  actions: Action[],
  to: string,
  content: string,
  merge?: (existing: string) => string,
): PlanStatus {
  if (!fs.existsSync(to)) {
    actions.push({ kind: "write", to, content, mode: PRIVATE });
    return "create";
  }
  const existing = fs.readFileSync(to, "utf8");
  if (!merge) {
    return existing === content ? "unchanged" : "conflict";
  }
  const merged = merge(existing);
  if (merged === existing) {
    return "unchanged";
  }
  actions.push({ kind: "write", to, content: merged, mode: fs.statSync(to).mode & 0o777 });
  return "update";
}

function readJsonText(text: string): Json {
  const value: unknown = JSON5.parse(text);
  return isPlainObject(value) ? value : {};
}

function copyStatus(targetExisted: boolean, created: number, conflicts: number): PlanStatus {
  if (conflicts > 0) {
    return "conflict";
  }
  if (created === 0) {
    return "unchanged";
  }
  return targetExisted ? "update" : "create";
}

function planConfig(
  p: MigrationParams,
  state: OpenClawState,
  actions: Action[],
  items: PlanItem[],
  envKeys: Set<string>,
): Json {
  const rewrite = createPathRewriter({ sourceDir: p.source, targetDir: p.target, home: p.home });
  const source = structuredClone(state.config);
  if (state.hookInstalls) {
    const hooks = isPlainObject(source.hooks) ? source.hooks : {};
    const internal = isPlainObject(hooks.internal) ? hooks.internal : {};
    if (!isPlainObject(internal.installs)) {
      internal.installs = state.hookInstalls;
      hooks.internal = internal;
      source.hooks = hooks;
      items.push({
        op: "rename",
        from: "state/openclaw.sqlite#config_machine_state/hooks.internal.installs",
        to: "bot.json#hooks.internal.installs",
      });
    }
  }
  const { config, report } = convertConfig({ source, rewrite, home: p.home });
  const configName = state.configFile ? path.basename(state.configFile) : "openclaw.json";
  for (const { from, to } of report.renamed) {
    items.push({ op: "rename", from: `${configName}#${from}`, to: `bot.json#${to}` });
  }
  for (const { path: at, reason } of report.dropped) {
    items.push({ op: "drop", from: `${configName}#${at}`, reason });
  }
  setWorkspaces(p, config, items, configName);

  const to = path.join(p.target, "bot.json");
  let added: string[] = [];
  const existed = fs.existsSync(to);
  const status = planWrite(actions, to, json(config), (text) => {
    const existing = readJsonText(text);
    added = mergeBeneath(existing, config);
    return added.length === 0 ? text : json(existing);
  });
  if (existed && status === "update") {
    actions.splice(actions.length - 1, 0, { kind: "backup", file: to });
  }
  items.push({
    op: "write",
    from: configName,
    to: "bot.json",
    status,
    ...(existed ? { names: added } : {}),
  });
  const missing = listEnvRefs(config).filter((key) => !envKeys.has(key));
  if (missing.length > 0) {
    items.push({ op: "note", from: configName, reason: "env-ref", names: missing });
  }
  return config;
}

/**
 * Name each copied workspace explicitly — `workspace` for the defaults,
 * `workspace-<id>` for another agent — so it is the one used whatever the
 * runtime's own default is. A workspace outside the OpenClaw dir stays where
 * it is and both installs point at it.
 */
function setWorkspaces(
  p: MigrationParams,
  config: Json,
  items: PlanItem[],
  configName: string,
): void {
  const agents = isPlainObject(config.agents) ? config.agents : {};
  const defaults = isPlainObject(agents.defaults) ? agents.defaults : {};
  const owners: Array<{ owner: Json; dir: string; at: string }> = [
    { owner: defaults, dir: "workspace", at: "agents.defaults.workspace" },
  ];
  const list = Array.isArray(agents.list) ? agents.list : [];
  list.forEach((entry, index) => {
    if (isPlainObject(entry) && typeof entry.id === "string" && entry.id !== "main") {
      owners.push({
        owner: entry,
        dir: `workspace-${entry.id}`,
        at: `agents.list[${index}].workspace`,
      });
    }
  });
  const target = homeForm(p.target, p.home);
  for (const { owner, dir, at } of owners) {
    if (typeof owner.workspace !== "string" && fs.existsSync(path.join(p.source, dir))) {
      owner.workspace = homeForm(path.join(p.target, dir), p.home);
      items.push({ op: "rename", from: `${configName}#${at}`, to: `bot.json#${at}` });
      agents.defaults = defaults;
      config.agents = agents;
    }
    const value = owner.workspace;
    if (
      typeof value === "string" &&
      !value.startsWith(`${target}/`) &&
      !value.startsWith(`${p.target}${path.sep}`)
    ) {
      items.push({ op: "note", from: value, reason: "workspace-in-place" });
    }
  }
}

function planEnv(p: MigrationParams, actions: Action[], items: PlanItem[]): Set<string> {
  const from = path.join(p.source, ".env");
  if (!fs.existsSync(from)) {
    return new Set();
  }
  const rewrite = createPathRewriter({ sourceDir: p.source, targetDir: p.target, home: p.home });
  const converted = convertEnvEntries(parseEnvEntries(fs.readFileSync(from, "utf8")), rewrite);
  for (const { from: key, to } of converted.renamed) {
    items.push({ op: "rename", from: `.env#${key}`, to: `.env#${to}` });
  }
  for (const key of converted.dropped) {
    items.push({ op: "drop", from: `.env#${key}`, reason: "locator" });
  }
  const to = path.join(p.target, ".env");
  const { text } = mergeEnvText(null, converted.entries);
  let added: string[] = converted.entries.map((entry) => entry.key);
  const status = planWrite(actions, to, text, (existing) => {
    const merged = mergeEnvText(existing, converted.entries);
    added = merged.added;
    return merged.text;
  });
  items.push({ op: "write", from: ".env", to: ".env", status, names: added });
  return new Set(converted.entries.map((entry) => entry.key));
}

function planCopies(p: MigrationParams, actions: Action[], items: PlanItem[]): void {
  const relink = relinkInto(p.source, p.target);
  const names = fs.existsSync(p.source) ? fs.readdirSync(p.source).toSorted() : [];
  const dirs = [
    ...names.filter((name) => name === "workspace" || name.startsWith("workspace-")),
    ...DIRS_COPIED.filter((name) => names.includes(name)),
  ];
  for (const name of dirs) {
    const fromDir = path.join(p.source, name);
    if (!fs.statSync(fromDir).isDirectory()) {
      continue;
    }
    const toDir = path.join(p.target, name);
    const existed = fs.existsSync(toDir);
    const skip = name === "credentials" ? (sub: string) => sub === "auth-profiles" : undefined;
    const tally = planCopyTree({ fromDir, toDir, actions, skip, relink });
    items.push({
      op: "copy",
      from: name,
      to: name,
      status: copyStatus(existed, tally.created, tally.conflicts.length),
      count: tally.created,
      ...(tally.conflicts.length > 0
        ? { names: tally.conflicts.map((c) => c.split(path.sep).join("/")) }
        : {}),
    });
    if (name === "credentials" && fs.existsSync(path.join(fromDir, "auth-profiles"))) {
      items.push({ op: "skip", from: "credentials/auth-profiles", reason: "encrypted" });
    }
  }
  for (const agentId of listDirs(path.join(p.source, "agents"))) {
    const workshop = path.join(p.source, "agents", agentId, "agent", "workshop-skills");
    if (!fs.existsSync(workshop)) {
      continue;
    }
    const toDir = path.join(p.target, "skills");
    const existed = fs.existsSync(toDir);
    const tally = planCopyTree({ fromDir: workshop, toDir, actions, relink });
    items.push({
      op: "copy",
      from: rel(p.source, workshop),
      to: "skills",
      status: copyStatus(existed, tally.created, tally.conflicts.length),
      count: tally.created,
      ...(tally.conflicts.length > 0 ? { names: tally.conflicts } : {}),
    });
  }
}

function listDirs(dir: string): string[] {
  if (!fs.existsSync(dir)) {
    return [];
  }
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .toSorted();
}

function planAuth(
  p: MigrationParams,
  state: OpenClawState,
  actions: Action[],
  items: PlanItem[],
): void {
  const agentIds = new Set(["main", ...Object.keys(state.agentAuth)]);
  for (const agentId of [...agentIds].toSorted()) {
    const local = state.agentAuth[agentId];
    if (agentId !== "main" && !local) {
      continue;
    }
    const shared = state.sharedAuth;
    if (!shared && !local) {
      continue;
    }
    const file = convertAuth(shared, local);
    if (Object.keys(file.profiles).length === 0) {
      continue;
    }
    const to = path.join(p.target, "agents", agentId, "agent", "auth-profiles.json");
    let names = Object.keys(file.profiles).toSorted();
    const status = planWrite(actions, to, json(file), (text) => {
      const existing = readJsonText(text);
      const merged = mergeAuth(existing, file);
      names = merged.added.toSorted();
      return JSON.stringify(merged.file) === JSON.stringify(existing) ? text : json(merged.file);
    });
    const from = [shared?.from, local?.from].filter(Boolean).join(" + ");
    items.push({ op: "write", from, to: rel(p.target, to), status, names });
  }
}

function planSessions(
  p: MigrationParams,
  state: OpenClawState,
  actions: Action[],
  items: PlanItem[],
): void {
  for (const agentId of Object.keys(state.sessions).toSorted()) {
    const sessions = state.sessions[agentId];
    if (!sessions) {
      continue;
    }
    const dir = path.join(p.target, "agents", agentId, "sessions");
    const entries: Json = {};
    for (const [key, entry] of Object.entries(sessions.entries)) {
      // A session id names its transcript file, so it must be a plain file name.
      if (typeof entry.sessionId !== "string" || !SAFE_SESSION_ID_RE.test(entry.sessionId)) {
        items.push({ op: "drop", from: `${sessions.from}/${key}`, reason: "session-id" });
        continue;
      }
      entries[key] = convertSessionEntry(entry);
    }
    if (Object.keys(entries).length > 0) {
      const to = path.join(dir, "sessions.json");
      let count = Object.keys(entries).length;
      const status = planWrite(actions, to, json(entries), (text) => {
        const existing = readJsonText(text);
        const added = Object.keys(entries).filter((key) => !Object.hasOwn(existing, key));
        count = added.length;
        for (const key of added) {
          existing[key] = entries[key];
        }
        return added.length === 0 ? text : json(existing);
      });
      items.push({ op: "write", from: sessions.from, to: rel(p.target, to), status, count });
    }
    for (const window of sessions.windows) {
      if (!SAFE_SESSION_ID_RE.test(window.sessionId)) {
        items.push({
          op: "drop",
          from: `${sessions.from.split("#")[0]}#transcript_events/${window.sessionId}`,
          reason: "session-id",
        });
        continue;
      }
      const name = window.current
        ? `${window.sessionId}.jsonl`
        : resetArchiveName(window.sessionId, window.updatedAt);
      const to = path.join(dir, name);
      const status = planWrite(actions, to, `${window.lines.join("\n")}\n`);
      items.push({
        op: "write",
        from: `${sessions.from.split("#")[0]}#transcript_events/${window.sessionId}`,
        to: rel(p.target, to),
        status,
        count: window.lines.length,
      });
    }
    for (const [sessionId, file] of Object.entries(sessions.files).toSorted(([a], [b]) =>
      a.localeCompare(b),
    )) {
      const to = path.join(dir, `${sessionId}.jsonl`);
      const status = planWrite(actions, to, fs.readFileSync(file, "utf8"));
      items.push({ op: "write", from: rel(p.source, file), to: rel(p.target, to), status });
    }
  }
}

function planCron(
  p: MigrationParams,
  state: OpenClawState,
  actions: Action[],
  items: PlanItem[],
): void {
  if (!state.cron) {
    return;
  }
  const jobs: Json[] = [];
  for (const job of state.cron.jobs) {
    const result = convertCronJob(job);
    if (result.ok) {
      jobs.push(result.job);
    } else {
      items.push({ op: "drop", from: `${state.cron.from}/${result.name}`, reason: result.reason });
    }
  }
  if (jobs.length === 0) {
    return;
  }
  const to = path.join(p.target, "cron", "jobs.json");
  let names = jobs.map((job) => String(job.name));
  const status = planWrite(actions, to, json({ version: 1, jobs }), (text) => {
    const existing = readJsonText(text);
    const current = Array.isArray(existing.jobs) ? existing.jobs : [];
    const ids = new Set(current.map((job) => (isPlainObject(job) ? job.id : undefined)));
    const added = jobs.filter((job) => !ids.has(job.id));
    names = added.map((job) => String(job.name));
    return added.length === 0 ? text : json({ ...existing, jobs: [...current, ...added] });
  });
  items.push({ op: "write", from: state.cron.from, to: "cron/jobs.json", status, names });
}

/** Hanzo Bot's pairing-store filename rule for a channel or account id. */
function safeKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\.\./g, "_");
}

/**
 * OpenClaw keeps an agent's heartbeat checklist in its database; Hanzo Bot
 * reads HEARTBEAT.md from the agent's workspace, where it lived before.
 */
function planHeartbeats(
  p: MigrationParams,
  state: OpenClawState,
  actions: Action[],
  items: PlanItem[],
): void {
  for (const [agentId, content] of Object.entries(state.heartbeats).toSorted(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const dir = agentId === "main" ? "workspace" : `workspace-${agentId}`;
    // A HEARTBEAT.md still in the OpenClaw workspace is copied with it.
    if (
      !/^[a-z0-9][a-z0-9_-]*$/i.test(agentId) ||
      fs.existsSync(path.join(p.source, dir, "HEARTBEAT.md"))
    ) {
      continue;
    }
    const to = path.join(p.target, dir, "HEARTBEAT.md");
    const status = planWrite(actions, to, content.endsWith("\n") ? content : `${content}\n`);
    const at = actions.at(-1);
    if (status === "create" && at?.kind === "write") {
      at.mode = 0o644;
    }
    items.push({
      op: "write",
      from: `${STATE_DB}#cron_job_scratch/heartbeat:${agentId}`,
      to: `${dir}/HEARTBEAT.md`,
      status,
    });
  }
}

function planPairing(
  p: MigrationParams,
  state: OpenClawState,
  actions: Action[],
  items: PlanItem[],
): void {
  if (!state.pairing) {
    return;
  }
  for (const [key, allowFrom] of Object.entries(state.pairing.lists)) {
    const [channel = "", account = ""] = key.split("\u0000");
    const name = `${safeKey(channel)}-${safeKey(account || "default")}-allowFrom.json`;
    const to = path.join(p.target, "credentials", name);
    let count = allowFrom.length;
    const status = planWrite(actions, to, json({ version: 1, allowFrom }), (text) => {
      const existing = readJsonText(text);
      const current = Array.isArray(existing.allowFrom) ? existing.allowFrom.map(String) : [];
      const added = allowFrom.filter((entry) => !current.includes(entry));
      count = added.length;
      return added.length === 0
        ? text
        : json({ ...existing, version: 1, allowFrom: [...current, ...added] });
    });
    items.push({
      op: "write",
      from: `${state.pairing.from}/${channel}/${account}`,
      to: `credentials/${name}`,
      status,
      count,
    });
  }
}

export function planMigration(p: MigrationParams): { plan: Plan; actions: Action[] } {
  const source = path.resolve(p.source);
  const target = path.resolve(p.target);
  // As written and with links resolved: ~/.bot may be a link to ~/.openclaw.
  for (const [a, b] of [
    [source, target],
    [realPathOf(source), realPathOf(target)],
  ]) {
    if (isWithin(a, b) || isWithin(b, a)) {
      throw new Error("the OpenClaw and Hanzo Bot state dirs must not contain each other");
    }
  }
  const params = { source, target, home: p.home };
  const state = readOpenClawState(source);
  if (!state.configFile && !fs.existsSync(path.join(source, "state", "openclaw.sqlite"))) {
    throw new Error(
      `no OpenClaw install at ${source} (no openclaw.json, no state/openclaw.sqlite)`,
    );
  }
  const actions: Action[] = [];
  const items: PlanItem[] = [];
  const envKeys = planEnv(params, actions, items);
  const config = planConfig(params, state, actions, items, envKeys);
  planCopies(params, actions, items);
  planAuth(params, state, actions, items);
  planSessions(params, state, actions, items);
  planCron(params, state, actions, items);
  planPairing(params, state, actions, items);
  planHeartbeats(params, state, actions, items);
  items.push(...planSkips(params, state, config));
  assertOutsideSource(source, actions);
  return {
    plan: {
      version: 1,
      source: homeForm(source, p.home),
      target: homeForm(target, p.home),
      items,
    },
    actions,
  };
}

export async function applyMigration(p: MigrationParams): Promise<Plan> {
  const { plan, actions } = planMigration(p);
  await applyActions(path.resolve(p.target), actions);
  return plan;
}
