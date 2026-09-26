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
