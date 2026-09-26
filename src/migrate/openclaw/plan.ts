import fs from "node:fs";
import path from "node:path";
import JSON5 from "json5";
import { resolveAgentConfig, resolveDefaultAgentId } from "../../agents/agent-scope.js";
import { hanzoCloudConfig } from "../../commands/hanzo-cloud-config.js";
import type { BotConfig } from "../../config/config.js";
import { SAFE_SESSION_ID_RE } from "../../config/sessions/paths.js";
import { normalizeAgentId } from "../../routing/session-key.js";
import {
  convertConfig,
  formatPath,
  listEnvRefs,
  mergeBeneath,
  validateMerge,
  yieldStarter,
} from "./config.js";
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
  assertOutsideSources,
  assertUniqueTargets,
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

/** A plan in the making: its actions and items, the targets they claim, and the dirs OpenClaw uses that it reads. */
type Planning = MigrationParams & {
  actions: Action[];
  items: PlanItem[];
  claimed: Set<string>;
  sources: Set<string>;
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
  p: Planning,
  state: OpenClawState,
  envKeys: Set<string>,
  starter: { anthropic: boolean },
): Json {
  const { actions, items } = p;
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
  const renames: PlanItem[] = report.renamed.map(({ from, to }) => ({
    op: "rename",
    from: `${configName}#${from}`,
    to: `bot.json#${to}`,
  }));
  for (const { path: at, reason } of report.dropped) {
    items.push({ op: "drop", from: `${configName}#${at}`, reason });
  }
  renames.push(...setWorkspaces(p, config, configName));

  const to = path.join(p.target, "bot.json");
  let effective = config;
  if (!fs.existsSync(to)) {
    actions.push({ kind: "write", to, content: json(config), mode: PRIVATE });
    p.claimed.add(to);
    items.push(...renames, { op: "write", from: configName, to: "bot.json", status: "create" });
  } else {
    const before = readJsonText(fs.readFileSync(to, "utf8"));
    const merged = structuredClone(before);
    // Values Hanzo Bot's first run wrote give way to the person's OpenClaw settings.
    const yielded = yieldStarter(merged, hanzoCloudConfig(p.home), config, starter);
    const { added, kept } = mergeBeneath(merged, config);
    const dropped = validateMerge(merged, before, added);
    const applied = added.map(formatPath).filter((label) => !dropped.includes(label));
    const status: PlanStatus = yielded.length + applied.length > 0 ? "update" : "unchanged";
    if (status === "update") {
      actions.push(
        { kind: "backup", file: to },
        { kind: "write", to, content: json(merged), mode: fs.statSync(to).mode & 0o777 },
      );
      p.claimed.add(to);
    }
    // A rename that the existing file overrules did not happen.
    const keptLabels = kept.map(formatPath);
    const overruled = (item: PlanItem) =>
      keptLabels.some((label) => {
        const at = item.to?.slice("bot.json#".length) ?? "";
        return at === label || at.startsWith(`${label}.`) || at.startsWith(`${label}[`);
      });
    items.push(...renames.filter((item) => !overruled(item)));
    items.push({ op: "write", from: configName, to: "bot.json", status, names: applied });
    for (const label of dropped) {
      items.push({ op: "drop", from: `${configName}#${label}`, reason: "merge" });
    }
    if (yielded.length > 0) {
      items.push({ op: "note", from: "bot.json", reason: "starter", names: yielded });
    }
    if (keptLabels.length > 0) {
      items.push({ op: "note", from: "bot.json", reason: "kept", names: keptLabels });
    }
    effective = merged;
  }
  const missing = listEnvRefs(config).filter((key) => !envKeys.has(key));
  if (missing.length > 0) {
    items.push({ op: "note", from: configName, reason: "env-ref", names: missing });
  }
  return effective;
}

/**
 * Name each copied workspace explicitly — `workspace` for the defaults,
 * `workspace-<id>` for another agent — so it is the one used whatever the
 * runtime's own default is. A workspace outside the OpenClaw dir stays where
 * it is and both installs point at it; the importer never writes into it.
 */
function setWorkspaces(p: Planning, config: Json, configName: string): PlanItem[] {
  const renames: PlanItem[] = [];
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
      renames.push({ op: "rename", from: `${configName}#${at}`, to: `bot.json#${at}` });
      agents.defaults = defaults;
      config.agents = agents;
    }
    const value = owner.workspace;
    if (
      typeof value === "string" &&
      !value.startsWith(`${target}/`) &&
      !value.startsWith(`${p.target}${path.sep}`)
    ) {
      p.items.push({ op: "note", from: value, reason: "workspace-in-place" });
      p.sources.add(expandHome(value, p.home));
    }
  }
  return renames;
}

function expandHome(value: string, home: string): string {
  return value === "~" || value.startsWith("~/") ? path.join(home, value.slice(1)) : value;
}

/** The workspace Hanzo Bot gives an agent under this config: resolveAgentWorkspaceDir's rules, rooted at the target. */
function agentWorkspace(p: MigrationParams, config: Json, agentId: string): string {
  const cfg = config as BotConfig;
  const id = normalizeAgentId(agentId);
  const own = resolveAgentConfig(cfg, id)?.workspace?.trim();
  if (own) {
    return path.resolve(expandHome(own, p.home));
  }
  if (id === resolveDefaultAgentId(cfg)) {
    const fallback = cfg.agents?.defaults?.workspace?.trim();
    return fallback ? path.resolve(expandHome(fallback, p.home)) : path.join(p.target, "workspace");
  }
  return path.join(p.target, `workspace-${id}`);
}

/**
 * Where the importer puts an agent's files that belong in its workspace. A
 * workspace outside the target (one OpenClaw also uses, or another dir the
 * existing bot.json names) is never written: they wait in
 * agents/<id>/from-openclaw/ and the plan says where to move them.
 */
function agentHome(
  p: Planning,
  config: Json,
  agentId: string,
): { dir: string; inside: boolean; workspace: string } {
  const workspace = agentWorkspace(p, config, agentId);
  if (isWithin(p.target, workspace)) {
    return { dir: workspace, inside: true, workspace };
  }
  const dir = path.join(p.target, "agents", normalizeAgentId(agentId), "from-openclaw");
  if (!p.items.some((item) => item.reason === "agent-outside" && item.names?.[0] === agentId)) {
    p.items.push({
      op: "note",
      from: homeForm(workspace, p.home),
      to: homeForm(dir, p.home),
      reason: "agent-outside",
      names: [agentId],
    });
  }
  return { dir, inside: false, workspace };
}

function planEnv(p: Planning): Set<string> {
  const { actions, items } = p;
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

function planCopies(p: Planning): void {
  const { actions, items, claimed, sources: reached } = p;
  const relink = relinkInto(p.source, p.target);
  const names = fs.existsSync(p.source) ? fs.readdirSync(p.source).toSorted() : [];
  const dirs = [
    ...names.filter((name) => name === "workspace" || name.startsWith("workspace-")),
    ...DIRS_COPIED.filter((name) => names.includes(name)),
  ];
  for (const name of dirs) {
    const fromDir = path.join(p.source, name);
    // A link to nothing has nothing to copy.
    if (!fs.existsSync(fromDir) || !fs.statSync(fromDir).isDirectory()) {
      continue;
    }
    const toDir = path.join(p.target, name);
    const existed = fs.existsSync(toDir);
    const skip = name === "credentials" ? (sub: string) => sub === "auth-profiles" : undefined;
    const tally = planCopyTree({ fromDir, toDir, actions, claimed, reached, skip, relink });
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
    if (tally.linkedTo) {
      items.push({
        op: "note",
        from: name,
        to: homeForm(tally.linkedTo, p.home),
        reason: "linked-dir",
      });
    }
    if (name === "credentials" && fs.existsSync(path.join(fromDir, "auth-profiles"))) {
      items.push({ op: "skip", from: "credentials/auth-profiles", reason: "encrypted" });
    }
  }
}

/**
 * Skill Workshop skills belong to one agent in OpenClaw, below the managed and
 * workspace skills of the same name. Each goes to that agent's workspace as a
 * project skill (<workspace>/.agents/skills), which only that agent loads; one
 * a higher source already names stays behind, as it was never the one used.
 */
function planWorkshopSkills(p: Planning, config: Json): void {
  const { actions, items, claimed, sources: reached } = p;
  const relink = relinkInto(p.source, p.target);
  // What loads before a workshop skill: the files already there or copied from OpenClaw.
  const before = [...claimed];
  for (const agentId of listDirs(path.join(p.source, "agents"))) {
    const workshop = path.join(p.source, "agents", agentId, "agent", "workshop-skills");
    if (!fs.existsSync(workshop)) {
      continue;
    }
    const home = agentHome(p, config, agentId);
    const toDir = home.inside
      ? path.join(home.dir, ".agents", "skills")
      : path.join(home.dir, "skills");
    const higher = [
      path.join(home.workspace, "skills"),
      path.join(home.workspace, ".agents", "skills"),
      path.join(p.home, ".agents", "skills"),
      path.join(p.source, "skills"),
    ];
    const shadowed: string[] = [];
    const skip = (sub: string) => {
      if (sub.includes(path.sep)) {
        return false;
      }
      const hit = higher.some(
        (dir) =>
          fs.existsSync(path.join(dir, sub)) ||
          before.some((file) => isWithin(path.join(dir, sub), file)),
      );
      if (hit) {
        shadowed.push(sub);
      }
      return hit;
    };
    const existed = fs.existsSync(toDir);
    const tally = planCopyTree({
      fromDir: workshop,
      toDir,
      actions,
      claimed,
      reached,
      skip,
      relink,
    });
    items.push({
      op: "copy",
      from: rel(p.source, workshop),
      to: rel(p.target, toDir),
      status: copyStatus(existed, tally.created, tally.conflicts.length),
      count: tally.created,
      ...(tally.conflicts.length > 0 ? { names: tally.conflicts } : {}),
    });
    if (shadowed.length > 0) {
      items.push({
        op: "skip",
        from: rel(p.source, workshop),
        reason: "shadowed",
        names: shadowed,
      });
    }
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

function planAuth(p: Planning, state: OpenClawState, anthropicOrder: string[]): void {
  const { actions, items } = p;
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
      // bot.json no longer sends Anthropic through the Hanzo proxy, so the
      // first run's IAM-token profile must not be offered to Anthropic.
      const order = isPlainObject(merged.file.order) ? merged.file.order : {};
      if (agentId === "main" && anthropicOrder.length > 0 && !Object.hasOwn(order, "anthropic")) {
        merged.file.order = { ...order, anthropic: anthropicOrder };
      }
      return JSON.stringify(merged.file) === JSON.stringify(existing) ? text : json(merged.file);
    });
    p.claimed.add(to);
    const from = [shared?.from, local?.from].filter(Boolean).join(" + ");
    items.push({ op: "write", from, to: rel(p.target, to), status, names });
  }
}

function planSessions(p: Planning, state: OpenClawState): void {
  const { actions, items } = p;
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

function planCron(p: Planning, state: OpenClawState): void {
  const { actions, items } = p;
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
function planHeartbeats(p: Planning, state: OpenClawState, config: Json): void {
  const { actions, items } = p;
  for (const [agentId, content] of Object.entries(state.heartbeats).toSorted(([a], [b]) =>
    a.localeCompare(b),
  )) {
    if (!/^[a-z0-9][a-z0-9_-]*$/i.test(agentId)) {
      continue;
    }
    // A HEARTBEAT.md still in the agent's OpenClaw workspace is copied with it,
    // or is read in place.
    const workspace = agentWorkspace(p, config, agentId);
    const openclawWorkspace = isWithin(p.target, workspace)
      ? path.join(p.source, path.relative(p.target, workspace))
      : workspace;
    if (fs.existsSync(path.join(openclawWorkspace, "HEARTBEAT.md"))) {
      continue;
    }
    const home = agentHome(p, config, agentId);
    const to = path.join(home.dir, "HEARTBEAT.md");
    const from = `${STATE_DB}#cron_job_scratch/heartbeat:${agentId}`;
    if (p.claimed.has(to)) {
      items.push({ op: "write", from, to: rel(p.target, to), status: "conflict" });
      continue;
    }
    const status = planWrite(actions, to, content.endsWith("\n") ? content : `${content}\n`);
    const at = actions.at(-1);
    if (status === "create" && at?.kind === "write") {
      at.mode = 0o644;
    }
    p.claimed.add(to);
    items.push({ op: "write", from, to: rel(p.target, to), status });
  }
}

function planPairing(p: Planning, state: OpenClawState): void {
  const { actions, items } = p;
  if (!state.pairing) {
    return;
  }
  for (const [key, allowFrom] of Object.entries(state.pairing.lists)) {
    const [channel = "", account = ""] = key.split("\u0000");
    const name = `${safeKey(channel)}-${safeKey(account || "default")}-allowFrom.json`;
    const to = path.join(p.target, "credentials", name);
    p.claimed.add(to);
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
  const state = readOpenClawState(source);
  if (!state.configFile && !fs.existsSync(path.join(source, "state", "openclaw.sqlite"))) {
    throw new Error(
      `no OpenClaw install at ${source} (no openclaw.json, no state/openclaw.sqlite)`,
    );
  }
  const planning: Planning = {
    source,
    target,
    home: p.home,
    actions: [],
    items: [],
    claimed: new Set(),
    sources: new Set([source]),
  };
  const mainAuth = convertAuth(state.sharedAuth, state.agentAuth.main);
  const anthropic = Object.entries(mainAuth.profiles)
    .filter(([, profile]) => profile.provider === "anthropic")
    .map(([id]) => id)
    .toSorted();
  const envKeys = planEnv(planning);
  const config = planConfig(planning, state, envKeys, { anthropic: anthropic.length > 0 });
  const yieldedAnthropic = planning.items.some(
    (item) => item.reason === "starter" && item.names?.includes("models.providers.anthropic"),
  );
  planCopies(planning);
  planWorkshopSkills(planning, config);
  planAuth(planning, state, yieldedAnthropic ? anthropic : []);
  planSessions(planning, state);
  planCron(planning, state);
  planPairing(planning, state);
  planHeartbeats(planning, state, config);
  planning.items.push(...planSkips(planning, state, config));
  assertUniqueTargets(planning.actions);
  assertOutsideSources({
    targetRoot: target,
    sources: planning.sources,
    actions: planning.actions,
  });
  return {
    plan: {
      version: 1,
      source: homeForm(source, p.home),
      target: homeForm(target, p.home),
      items: planning.items,
    },
    actions: planning.actions,
  };
}

export async function applyMigration(p: MigrationParams): Promise<Plan> {
  const { plan, actions } = planMigration(p);
  await applyActions(path.resolve(p.target), actions);
  return plan;
}
