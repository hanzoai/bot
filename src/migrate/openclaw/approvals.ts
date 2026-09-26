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
type Field = "security" | "ask";

/** A policy document and where it came from; doc null: OpenClaw ran no exec with it. */
export type ApprovalsSource = { label: string; doc: Json | null };

export type ApprovalsReport = {
  tightened: Array<{ from: string; to: string }>;
  /** Labels of documents OpenClaw could not use, so it denied exec. */
  closed: string[];
};

const FIELDS: readonly Field[] = ["security", "ask"];

/** Lower is stricter; an unset value is the loosest, as OpenClaw's fallback is full/off. */
const RANK: Record<Field, Map<unknown, number>> = {
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

function rank(field: Field, value: unknown): number {
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
 * (assertNoPendingLegacyExecApprovals), so it counts as a closed policy.
 */
export function approvalSources(approvals: ApprovalsState): ApprovalsSource[] {
  const sources: ApprovalsSource[] = [];
  if (approvals.file !== null || approvals.claim) {
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
  field: Field,
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
 * Fold each policy into the config, in order: the root, then each
 * agents.list entry. With no agents.list the root is main's scope; with one it
 * is the scope of every agent not listed, which the policy's "*" entry and
 * defaults govern. A field is written only where the policy is stricter than
 * what the scope gets from the config (its own value, else the root's; unset
 * is loosest), and the value written is the policy's.
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
  for (const source of sources) {
    if (!source.doc) {
      report.closed.push(source.label);
    }
    tighten(report, source, config, "tools.exec", agents.length === 0 ? "main" : undefined, {});
    const root = execOf(config) ?? {};
    for (const [scope, at, id] of agents) {
      tighten(report, source, scope, at, id, root);
    }
  }
  return report;
}

/** Write each field of one scope that the policy makes stricter than the scope's own, else the inherited, value. */
function tighten(
  report: ApprovalsReport,
  source: ApprovalsSource,
  scope: Json,
  at: string,
  agentId: string | undefined,
  inherited: Json,
): void {
  const doc = source.doc ?? CLOSED;
  // A database label already names its table after "#": state/openclaw.sqlite#exec_approvals_config/defaults.ask.
  const separator = source.label.includes("#") ? "/" : "#";
  for (const field of FIELDS) {
    const policy = policyField(doc, agentId, field);
    const current = execOf(scope)?.[field] ?? inherited[field];
    if (!policy || rank(field, policy.value) >= rank(field, current)) {
      continue;
    }
    ensureExec(scope)[field] = policy.value;
    report.tightened.push({
      from: source.doc ? `${source.label}${separator}${policy.path}` : source.label,
      to: `${at}.${field}="${policy.value}"`,
    });
  }
}
