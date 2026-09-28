import { normalizeAgentId } from "../../routing/session-key.js";
import { APPROVALS_FILE, STATE_DB, type ApprovalsState } from "./state.js";

/**
 * OpenClaw bounds exec with its approvals policy (exec-approvals.json, later
 * the exec_approvals_config row of state/openclaw.sqlite): on a gateway or node
 * host it runs security = minSecurity(config, policy) and ask = maxAsk(config,
 * policy) (OpenClaw's src/agents/exec-defaults.ts). Hanzo Bot reads no OpenClaw
 * policy, so the import folds it into bot.json's tools.exec: a scope is only
 * ever tightened, never loosened, so the import runs nothing OpenClaw kept out.
 */

type Json = Record<string, unknown>;
export type ExecField = "security" | "ask";

/** A policy document and where it came from; doc null: OpenClaw ran no exec with it. */
export type ApprovalsSource = { label: string; doc: Json | null };

export type ApprovalsReport = {
  /**
   * What the policies wrote. exec-approvals tightens a scope;
   * exec-approvals-agent keeps a listed agent at what OpenClaw ran it with,
   * above a root tightened for the other agents.
   */
  tightened: Array<{ from: string; to: string; reason: "exec-approvals" | "exec-approvals-agent" }>;
  /** Labels of documents OpenClaw could not use, so it denied exec. */
  closed: string[];
};

export const EXEC_FIELDS: readonly ExecField[] = ["security", "ask"];

/** Lower is stricter; an unset value is the loosest, as OpenClaw's fallback is full/off. */
const RANK: Record<ExecField, Map<unknown, number>> = {
  security: new Map<unknown, number>([
    ["deny", 0],
    ["allowlist", 1],
    ["full", 2],
  ]),
  ask: new Map<unknown, number>([
    ["always", 0],
    ["on-miss", 1],
    ["off", 2],
  ]),
};
const LOOSEST = 2;
const LOOSEST_VALUE: Record<ExecField, string> = { security: "full", ask: "off" };

/** What OpenClaw runs with a document it cannot use: fail closed. */
const CLOSED: Json = { version: 1, defaults: { security: "deny", ask: "off" } };

function isPlainObject(value: unknown): value is Json {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function rank(field: ExecField, value: unknown): number {
  return RANK[field].get(value) ?? LOOSEST;
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function optional(entry: Json, key: string, check: (value: unknown) => boolean): boolean {
  return !Object.hasOwn(entry, key) || check(entry[key]);
}

const isString = (value: unknown) => typeof value === "string";
const isNumber = (value: unknown) => typeof value === "number" && Number.isFinite(value);
const isNonNegative = (value: unknown) => isNumber(value) && (value as number) >= 0;

function validPolicy(policy: unknown): policy is Json {
  return (
    isPlainObject(policy) &&
    optional(policy, "security", (value) => RANK.security.has(value)) &&
    optional(policy, "ask", (value) => RANK.ask.has(value)) &&
    optional(policy, "askFallback", (value) => RANK.security.has(value)) &&
    optional(policy, "autoAllowSkills", (value) => typeof value === "boolean")
  );
}

function validAllowlistEntry(entry: unknown): boolean {
  if (typeof entry === "string") {
    return entry.trim().length > 0;
  }
  return (
    isPlainObject(entry) &&
    isText(entry.pattern) &&
    ["id", "source", "commandText", "argPattern", "lastUsedCommand", "lastResolvedPath"].every(
      (key) => optional(entry, key, isString),
    ) &&
    optional(entry, "lastUsedAt", isNumber)
  );
}

function validMcpTool(entry: unknown): boolean {
  return (
    isPlainObject(entry) &&
    isText(entry.server) &&
    isText(entry.tool) &&
    entry.source === "allow-always" &&
    isNonNegative(entry.addedAt) &&
    optional(entry, "lastUsedAt", isNonNegative)
  );
}

function validAgent(agent: unknown): boolean {
  return (
    validPolicy(agent) &&
    optional(
      agent,
      "allowlist",
      (list) => Array.isArray(list) && list.every((entry) => validAllowlistEntry(entry)),
    ) &&
    optional(
      agent,
      "mcpTools",
      (list) => Array.isArray(list) && list.every((entry) => validMcpTool(entry)),
    )
  );
}

/**
 * A document OpenClaw's persisted-policy schema accepts
 * (persistedExecApprovalsSchema, OpenClaw's src/infra/exec-approvals-config.ts);
 * OpenClaw denies exec on any other.
 */
function validDocument(doc: unknown): doc is Json {
  return (
    isPlainObject(doc) &&
    doc.version === 1 &&
    optional(
      doc,
      "socket",
      (socket) =>
        isPlainObject(socket) &&
        optional(socket, "path", isString) &&
        optional(socket, "token", isString),
    ) &&
    optional(doc, "defaults", validPolicy) &&
    optional(
      doc,
      "agents",
      (agents) =>
        isPlainObject(agents) &&
        !Object.hasOwn(agents, "__proto__") &&
        Object.values(agents).every((agent) => validAgent(agent)),
    )
  );
}

/** The policy in a document's text, or null when OpenClaw could not use it. */
export function parseApprovals(text: string): Json | null {
  try {
    const doc: unknown = JSON.parse(text);
    return validDocument(doc) ? doc : null;
  } catch {
    return null;
  }
}

/**
 * The policies to fold, in order. Where the state database keeps the policy,
 * a leftover exec-approvals.json (or doctor's claim on it) makes OpenClaw
 * refuse exec until `openclaw doctor --fix` imports it
 * (assertNoPendingLegacyExecApprovals), so it counts as a closed policy. An
 * entry OpenClaw may not read (a dangling link, a dir) counts as closed too.
 */
export function approvalSources(approvals: ApprovalsState): ApprovalsSource[] {
  const sources: ApprovalsSource[] = [];
  if (approvals.present || approvals.claim) {
    const pending = approvals.table || approvals.file === null;
    sources.push({
      label: APPROVALS_FILE,
      doc: pending ? null : parseApprovals(approvals.file ?? ""),
    });
  }
  if (approvals.row !== null) {
    sources.push({
      label: `${STATE_DB}#exec_approvals_config`,
      doc: parseApprovals(approvals.row),
    });
  }
  return sources;
}

/**
 * The value OpenClaw's resolver (resolveExecApprovalsFromFilePrepared) gives
 * one field for one agent, and the path it came from: the agent's own entry,
 * else agents["*"], else defaults. OpenClaw moves the legacy agents.default
 * entry into main's, where main does not set the field
 * (normalizeExecApprovalsInternal), so an agent named "default" has none.
 * undefined: the document leaves the field to OpenClaw's fallback (full/off).
 */
function agentKeys(agentId: string | undefined): string[] {
  switch (agentId) {
    case undefined:
    case "default":
      return ["*"];
    case "main":
      return ["main", "default", "*"];
    default:
      return [agentId, "*"];
  }
}

function policyField(
  doc: Json,
  agentId: string | undefined,
  field: ExecField,
): { value: string; path: string } | undefined {
  const agents = isPlainObject(doc.agents) ? doc.agents : {};
  const keys = agentKeys(agentId);
  for (const key of keys) {
    const entry = Object.hasOwn(agents, key) ? agents[key] : undefined;
    const value = isPlainObject(entry) ? entry[field] : undefined;
    if (typeof value === "string") {
      return { value, path: `agents.${key}.${field}` };
    }
  }
  const value = isPlainObject(doc.defaults) ? doc.defaults[field] : undefined;
  return typeof value === "string" ? { value, path: `defaults.${field}` } : undefined;
}

function child(parent: Json, key: string): Json | undefined {
  const value = parent[key];
  return isPlainObject(value) ? value : undefined;
}

function execOf(scope: Json): Json | undefined {
  return child(child(scope, "tools") ?? {}, "exec");
}

function ensureExec(scope: Json): Json {
  const tools = child(scope, "tools") ?? {};
  scope.tools = tools;
  const exec = child(tools, "exec") ?? {};
  tools.exec = exec;
  return exec;
}

/**
 * Fold each policy into the config, in order. The root is tightened where the
 * policy is stricter than its own value: with no agents.list the root is
 * main's scope; with one it is the scope of every agent not listed, which the
 * policy's "*" entry and defaults govern. Each listed agent then runs what
 * OpenClaw ran it with, field by field: the stricter of its value before this
 * policy (its own, else the root's) and the policy's value for it. That value
 * is written on the agent wherever what it would get from the config now (its
 * own, else the tightened root's) ranks differently, so the root tightened for
 * unlisted agents never holds a listed agent below what OpenClaw let it run.
 */
export function foldApprovals(config: Json, sources: ApprovalsSource[]): ApprovalsReport {
  const report: ApprovalsReport = { tightened: [], closed: [] };
  const list = child(config, "agents")?.list;
  const agents: Array<[scope: Json, at: string, id: string]> = [];
  if (Array.isArray(list)) {
    list.forEach((entry, index) => {
      if (isPlainObject(entry)) {
        const id = normalizeAgentId(typeof entry.id === "string" ? entry.id : undefined);
        agents.push([entry, `agents.list[${index}].tools.exec`, id]);
      }
    });
  }
  // With no agents.list the root is main's scope, and that of each agent a
  // binding names, which OpenClaw and Hanzo Bot both run unlisted; with one
  // it is the scope of every agent not listed, which "*" and defaults govern.
  const rootAgentIds =
    agents.length === 0
      ? ["main", ...bindingAgentIds(config).filter((id) => id !== "main")]
      : [undefined];
  for (const source of sources) {
    if (!source.doc) {
      report.closed.push(source.label);
    }
    const root = () => execOf(config) ?? {};
    const before = agents.map(([scope]) => effective(scope, root()));
    fold(report, source, config, "tools.exec", rootAgentIds, {}, {});
    agents.forEach(([scope, at, id], index) => {
      fold(report, source, scope, at, [id], before[index] ?? {}, root());
    });
  }
  return report;
}

/**
 * OpenClaw applies its approvals policy after a session's /exec, as a floor on
 * the gateway and node hosts (resolveExecDefaults: minSecurity and maxAsk
 * after the config and session layers), so no /exec lifts it. Hanzo Bot
 * applies its own exec-approvals.json at that same point
 * (resolveExecHostApprovalContext), while a /exec replaces bot.json's
 * tools.exec, so the policy goes into that file too. `existing` is the file's
 * text now (null: none). Each agent is held to the stricter of what the file
 * gave it and what the policies give it: "*" for agents neither names, then
 * each agent either names. Nothing else in the file changes. Returns the text
 * and the settings written; null when the policies hold no agent to anything.
 */
export function floorApprovals(
  sources: ApprovalsSource[],
  existing: string | null,
  label: string,
): { text: string; names: string[] } | null {
  const docs = sources.map((source) => source.doc ?? CLOSED);
  const imported = (agentId: string | undefined, field: ExecField) =>
    importedValue(docs, agentId, field);
  const keys: string[] = [];
  const addKeys = (doc: Json) => {
    for (const key of Object.keys(child(doc, "agents") ?? {})) {
      // Both read a legacy "default" entry as main's; no agent's id is "".
      const id = key === "default" ? "main" : key;
      if (id !== "*" && id !== "" && !keys.includes(id)) {
        keys.push(id);
      }
    }
  };
  docs.forEach(addKeys);
  const holds = [undefined, ...keys].some((agentId) =>
    EXEC_FIELDS.some((field) => rank(field, imported(agentId, field)) < LOOSEST),
  );
  if (!holds) {
    return null;
  }
  const file = hostFile(existing, label);
  const before = structuredClone(file);
  addKeys(before);
  const names: string[] = [];
  for (const key of ["*", ...keys]) {
    const agentId = key === "*" ? undefined : key;
    for (const field of EXEC_FIELDS) {
      const target = stricter(field, hostValue(before, agentId, field), imported(agentId, field));
      if (rank(field, target) === rank(field, hostValue(file, agentId, field))) {
        continue;
      }
      // No floor, where "*" now holds this agent to one, is the loosest value.
      const value = target ?? LOOSEST_VALUE[field];
      const agents = child(file, "agents") ?? {};
      file.agents = agents;
      const entry = child(agents, key) ?? {};
      agents[key] = entry;
      entry[field] = value;
      names.push(`agents.${key}.${field}=${JSON.stringify(value)}`);
    }
  }
  // Already held there: the file stays as it is, byte for byte.
  const text =
    names.length === 0 && existing !== null ? existing : `${JSON.stringify(file, null, 2)}\n`;
  return { text, names };
}

/** The stricter of each policy's value of one field for one agent (unset: none holds it). */
function importedValue(docs: Json[], agentId: string | undefined, field: ExecField): unknown {
  let value: unknown;
  for (const doc of docs) {
    value = stricter(field, value, policyField(doc, agentId, field)?.value);
  }
  return value;
}

/** OpenClaw's floor under a session's /exec, by agent id: what its policies hold the agent to. */
export function policyFloor(
  sources: ApprovalsSource[],
): (id: string) => { security: unknown; ask: unknown } {
  const docs = sources.map((source) => source.doc ?? CLOSED);
  return (id) => ({
    security: importedValue(docs, id, "security"),
    ask: importedValue(docs, id, "ask"),
  });
}

/**
 * Hanzo Bot's floor under a session's /exec, by agent id: what its
 * exec-approvals.json (`text`, null: none) holds the agent to. The file is
 * read only when asked.
 */
export function hostFloor(
  text: string | null,
  label: string,
): (id: string) => { security: unknown; ask: unknown } {
  let file: Json | undefined;
  return (id) => {
    file ??= hostFile(text, label);
    return { security: hostValue(file, id, "security"), ask: hostValue(file, id, "ask") };
  };
}

/**
 * The exec approvals file as Hanzo Bot reads it (loadExecApprovals): JSON
 * with version 1, else no policy at all. One whose defaults, agents or an
 * agent entry is not an object is refused rather than merged into.
 */
function hostFile(text: string | null, label: string): Json {
  let doc: unknown;
  try {
    doc = text === null ? undefined : JSON.parse(text);
  } catch {
    doc = undefined;
  }
  if (!isPlainObject(doc) || doc.version !== 1) {
    return { version: 1 };
  }
  const agents = doc.agents;
  const shaped =
    optional(doc, "defaults", isPlainObject) &&
    optional(
      doc,
      "agents",
      (value) => isPlainObject(value) && Object.values(value).every(isPlainObject),
    );
  if (!shaped || (isPlainObject(agents) && Object.hasOwn(agents, "__proto__"))) {
    throw new Error(
      `${label} is not an exec policy the import can add OpenClaw's to (defaults, agents or an agent entry is not an object); fix or remove it, then import again; nothing was written`,
    );
  }
  return doc;
}

/**
 * The security or ask Hanzo Bot's exec approvals file holds one agent to
 * (resolveExecApprovalsFromFile): its entry (main's merged with a legacy
 * "default"), else "*", else defaults; a value it does not accept falls to
 * defaults. undefined: no floor.
 */
function hostValue(file: Json, agentId: string | undefined, field: ExecField): unknown {
  const valid = (value: unknown) => (RANK[field].has(value) ? value : undefined);
  const defaults = child(file, "defaults")?.[field];
  const agents = child(file, "agents") ?? {};
  const entry = (key: string) => (Object.hasOwn(agents, key) ? child(agents, key) : undefined);
  let own: unknown;
  if (agentId !== undefined && agentId !== "default") {
    own = entry(agentId)?.[field];
    if (agentId === "main") {
      own ??= entry("default")?.[field];
    }
  }
  return valid(own ?? entry("*")?.[field] ?? defaults) ?? valid(defaults);
}

/** The agent ids bindings name, normalized, once each, in order; a blank one routes to the default agent. */
export function bindingAgentIds(config: Json): string[] {
  const ids: string[] = [];
  for (const binding of Array.isArray(config.bindings) ? config.bindings : []) {
    const agentId = isPlainObject(binding) ? binding.agentId : undefined;
    if (typeof agentId === "string" && agentId.trim() !== "") {
      const id = normalizeAgentId(agentId);
      if (!ids.includes(id)) {
        ids.push(id);
      }
    }
  }
  return ids;
}

/** A scope's security and ask: its own, else the inherited value. */
function effective(scope: Json, inherited: Json): Json {
  const exec = execOf(scope) ?? {};
  return Object.fromEntries(EXEC_FIELDS.map((field) => [field, exec[field] ?? inherited[field]]));
}

/** The stricter of two values of one field (unset is loosest); the first where they rank the same. */
export function stricter(field: ExecField, a: unknown, b: unknown): unknown {
  return rank(field, b) < rank(field, a) ? b : a;
}

/** Whether `value` lets more run than `than` does. */
export function looser(field: ExecField, value: unknown, than: unknown): boolean {
  return rank(field, value) > rank(field, than);
}

/**
 * Write each field of one scope whose value from the config now (its own,
 * else `inherited`) ranks differently from the stricter of `before` (what it
 * ran with before this policy) and the policy's value for the agents the
 * scope serves (the strictest of them). The root inherits nothing and
 * `before` is its own value, so it is only ever tightened.
 */
function fold(
  report: ApprovalsReport,
  source: ApprovalsSource,
  scope: Json,
  at: string,
  agentIds: Array<string | undefined>,
  before: Json,
  inherited: Json,
): void {
  const doc = source.doc ?? CLOSED;
  // A database label already names its table after "#": state/openclaw.sqlite#exec_approvals_config/defaults.ask.
  const separator = source.label.includes("#") ? "/" : "#";
  for (const field of EXEC_FIELDS) {
    let policy: { value: string; path: string } | undefined;
    for (const agentId of agentIds) {
      const found = policyField(doc, agentId, field);
      if (found && (!policy || rank(field, found.value) < rank(field, policy.value))) {
        policy = found;
      }
    }
    if (!policy) {
      continue;
    }
    const own = execOf(scope)?.[field];
    const target = stricter(field, policy.value, own ?? before[field]);
    const now = own ?? inherited[field];
    if (rank(field, target) === rank(field, now)) {
      continue;
    }
    ensureExec(scope)[field] = target;
    report.tightened.push({
      from: source.doc ? `${source.label}${separator}${policy.path}` : source.label,
      to: `${at}.${field}="${String(target)}"`,
      reason: looser(field, target, now) ? "exec-approvals-agent" : "exec-approvals",
    });
  }
}
