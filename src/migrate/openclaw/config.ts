import fs from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { listAgentIds, resolveDefaultAgentId } from "../../agents/agent-scope.js";
import { allocateColor } from "../../browser/profiles.js";
import type { BotConfig } from "../../config/config.js";
import {
  validateConfigObjectRaw,
  validateConfigObjectRawWithPlugins,
} from "../../config/validation.js";
import { BotSchema } from "../../config/zod-schema.js";
import { PLUGIN_MANIFEST_FILENAME } from "../../plugins/manifest.js";
import { normalizeAgentId } from "../../routing/session-key.js";
import {
  EXEC_FIELDS,
  foldApprovals,
  looser,
  stricter,
  type ApprovalsReport,
  type ApprovalsSource,
  type ExecField,
} from "./approvals.js";
import { botConfigKeyTree, pruneToTree } from "./keys.js";
import type { PathRewriter } from "./paths.js";

/**
 * openclaw.json → bot.json, in six steps, each reported:
 *   1. roster: the agents OpenClaw runs and the one that answers messages no
 *      binding matches; a roster OpenClaw would not load, or one that
 *      answers them with no agent, stops the import
 *   2. renames: settings OpenClaw moved after Hanzo Bot forked from it go back
 *      to where Hanzo Bot reads them; tools.exec.mode becomes the security and
 *      ask it stands for, which OpenClaw's exec approvals policy then tightens
 *   3. drops: settings that name OpenClaw-only machinery (plugin installs,
 *      secret-store refs, write stamps)
 *   4. paths: strings naming the OpenClaw state dir name the Hanzo Bot one
 *   5. prune: keys bot.json does not admit are dropped
 *   6. validate: values the runtime still rejects are dropped, unless that
 *      would send messages to another agent than OpenClaw did
 * docs/install/migrate-from-openclaw.md states the mapping for people. The Go
 * importer (hanzobot/go pkg/migrate/openclaw) follows the same rules, item for
 * item.
 */

type Json = Record<string, unknown>;

export type ConfigDropReason =
  | "metadata"
  | "plugins"
  | "secret-store"
  | "model-catalog"
  | "superseded"
  | "exec-mode"
  | "exec-invalid"
  | "openclaw-only"
  | "invalid"
  | "no-plugin"
  | "no-channel";

export type ConfigReport = {
  renamed: Array<{ from: string; to: string }>;
  dropped: Array<{ path: string; reason: ConfigDropReason }>;
  /** Settings the person should look at: exec values OpenClaw does not accept, so it ran no exec. */
  notes: Array<{ path: string; reason: "exec-mode-unknown" | "exec-invalid" }>;
  /** What OpenClaw's exec approvals policy tightened. */
  approvals: ApprovalsReport;
};

function isPlainObject(value: unknown): value is Json {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function child(parent: Json, key: string): Json | undefined {
  const value = parent[key];
  return isPlainObject(value) ? value : undefined;
}

function ensure(parent: Json, key: string): Json {
  const existing = child(parent, key);
  if (existing) {
    return existing;
  }
  const created: Json = {};
  parent[key] = created;
  return created;
}

/** Move parent[key] to target[targetKey] unless the target already has it. */
function move(
  report: ConfigReport,
  parent: Json,
  key: string,
  from: string,
  target: () => Json,
  targetKey: string,
  to: string,
): void {
  if (!Object.hasOwn(parent, key)) {
    return;
  }
  const value = parent[key];
  delete parent[key];
  const dest = target();
  if (Object.hasOwn(dest, targetKey)) {
    report.dropped.push({ path: from, reason: "superseded" });
    return;
  }
  dest[targetKey] = value;
  report.renamed.push({ from, to });
}

function pruneEmpty(parent: Json, key: string): void {
  const value = child(parent, key);
  if (value && Object.keys(value).length === 0) {
    delete parent[key];
  }
}

const WEB_SEARCH_PROVIDERS: Array<[plugin: string, key: string]> = [
  ["perplexity", "perplexity"],
  ["google", "gemini"],
  ["xai", "grok"],
  ["moonshot", "kimi"],
];

/** OpenClaw 2026.9.6's agent id rule for an agents.entries key. */
const ENTRY_KEY_RE = /^[a-z0-9_][a-z0-9_-]{0,63}$/i;

function refuseRoster(at: string, why: string): never {
  throw new Error(
    `OpenClaw would not load ${at}: ${why}; run openclaw doctor --fix or fix it by hand, then import again; nothing was written`,
  );
}

function refuseRoute(why: string): never {
  throw new Error(
    `the import would send messages to other agents than OpenClaw did (${why}); nothing was written`,
  );
}

/**
 * The agent that answers a message no binding matches. A legacy roster (an
 * agents.list with no agents.entries or agents.ownership) is read as every
 * OpenClaw before 2026.9 and Hanzo Bot read it: the first default: true
 * entry, else the first entry, else main. A current one is read as OpenClaw
 * 2026.9.6's config loader and router read it (readAgentRosterProperty,
 * migratePersistedImplicitMainRoster, resolveAgentRoute): a roster its schema
 * rejects ran no agent, and one that answers such a message with no agent
 * (AgentSelectionRequiredError) has no Hanzo Bot equivalent, since a Hanzo Bot
 * roster always has a default agent; both stop the import.
 */
function rosterOwner(config: Json): string {
  const agents = child(config, "agents") ?? {};
  if (!Object.hasOwn(agents, "entries") && !Object.hasOwn(agents, "ownership")) {
    const list = Array.isArray(agents.list) ? agents.list.filter(isPlainObject) : [];
    const chosen = list.find((entry) => entry.default === true) ?? list[0];
    return normalizeAgentId(typeof chosen?.id === "string" ? chosen.id : undefined);
  }
  const explicit = agents.ownership === "explicit";
  if (Object.hasOwn(agents, "ownership") && !explicit) {
    refuseRoster("agents.ownership", 'not "explicit"');
  }
  const roster: Array<{ at: string; id: string; entry: Json }> = [];
  const hasRoster = Object.hasOwn(agents, "entries") || Object.hasOwn(agents, "list");
  if (Object.hasOwn(agents, "entries")) {
    if (Object.hasOwn(agents, "list")) {
      refuseRoster("agents.list", "beside agents.entries");
    }
    const entries = agents.entries;
    if (!isPlainObject(entries)) {
      refuseRoster("agents.entries", "not an object");
    }
    for (const [key, entry] of Object.entries(entries)) {
      const at = `agents.entries.${key}`;
      if (!isPlainObject(entry)) {
        refuseRoster(at, "not an object");
      }
      if (!ENTRY_KEY_RE.test(key)) {
        refuseRoster(at, "not an agent id");
      }
      const id = normalizeAgentId(key);
      if (roster.some((other) => other.id === id)) {
        refuseRoster(at, "the same agent as another entry");
      }
      if (Object.hasOwn(entry, "id")) {
        refuseRoster(`${at}.id`, "inside agents.entries");
      }
      roster.push({ at, id, entry });
    }
  } else if (Object.hasOwn(agents, "list")) {
    const list = agents.list;
    if (!Array.isArray(list)) {
      refuseRoster("agents.list", "not a list");
    }
    list.forEach((entry: unknown, index) => {
      const at = `agents.list[${index}]`;
      if (!isPlainObject(entry)) {
        refuseRoster(at, "not an object");
      }
      const id = entry.id;
      if (typeof id !== "string" || id === "" || id.trim() !== id || normalizeAgentId(id) !== id) {
        refuseRoster(`${at}.id`, "not an agent id");
      }
      if (roster.some((other) => other.id === id)) {
        refuseRoster(`${at}.id`, "the same agent as another entry");
      }
      roster.push({ at, id, entry });
    });
  }
  const marked: Array<{ at: string; id: string }> = [];
  for (const { at, id, entry } of roster) {
    if (Object.hasOwn(entry, "default") && typeof entry.default !== "boolean") {
      refuseRoster(`${at}.default`, "not true or false");
    }
    if (entry.default === true) {
      marked.push({ at, id });
    }
  }
  if (explicit && marked.length > 0) {
    refuseRoster(`${marked[0]?.at}.default`, 'beside agents.ownership "explicit"');
  }
  if (marked.length > 1) {
    refuseRoster(`${marked[1]?.at}.default`, "a second default agent");
  }
  // With no roster, or an empty one it is not told to keep empty, OpenClaw runs main.
  const ids =
    roster.length > 0 ? roster.map((entry) => entry.id) : explicit && hasRoster ? [] : ["main"];
  const defaults = child(agents, "defaults");
  let system: string | undefined;
  if (defaults && Object.hasOwn(defaults, "systemAgent")) {
    const systemAgent = defaults.systemAgent;
    if (!isPlainObject(systemAgent)) {
      refuseRoster("agents.defaults.systemAgent", "not an object");
    }
    if (Object.hasOwn(systemAgent, "agentId")) {
      const raw = systemAgent.agentId;
      if (typeof raw !== "string" || raw.trim() === "" || !ids.includes(normalizeAgentId(raw))) {
        refuseRoster("agents.defaults.systemAgent.agentId", "not an agent in the roster");
      }
      system = normalizeAgentId(raw);
    }
  }
  if (Object.hasOwn(config, "bindings")) {
    const bindings = config.bindings;
    if (!Array.isArray(bindings)) {
      refuseRoster("bindings", "not a list");
    }
    bindings.forEach((binding: unknown, index) => {
      if (!isPlainObject(binding) || typeof binding.agentId !== "string") {
        refuseRoster(`bindings[${index}]`, "not a binding");
      }
      // A blank agentId routes to the owner (pickFirstExistingAgentId).
      const agentId = binding.agentId;
      if (hasRoster && agentId.trim() !== "" && !ids.includes(normalizeAgentId(agentId))) {
        refuseRoster(`bindings[${index}].agentId`, "not an agent in the roster");
      }
    });
  }
  const owner = explicit
    ? (system ?? (ids.length === 1 ? ids[0] : undefined))
    : marked.length === 1
      ? marked[0]?.id
      : ids.length === 1
        ? ids[0]
        : undefined;
  if (!owner) {
    const why = !explicit
      ? "several agents, and none is default"
      : ids.length === 0
        ? 'agents.ownership is "explicit" and the roster is empty'
        : 'agents.ownership is "explicit" and agents.defaults.systemAgent names no agent';
    throw new Error(
      `OpenClaw answers a message no binding matches with no agent (${why}); mark one agent default: true, or name one in agents.defaults.systemAgent.agentId, then import again; nothing was written`,
    );
  }
  return owner;
}

/**
 * agents.entries becomes agents.list, each agent {id: key, ...entry}. Where
 * agents.ownership is "explicit", the agent agents.defaults.systemAgent names
 * answers unbound messages; in Hanzo Bot that agent is the default one.
 */
function applyRoster(agents: Json, owner: string, report: ConfigReport): void {
  const explicit = agents.ownership === "explicit";
  const entries = child(agents, "entries");
  if (entries) {
    agents.list = Object.entries(entries).map(([id, entry]) => ({ id, ...(entry as Json) }));
    delete agents.entries;
    report.renamed.push({ from: "agents.entries", to: "agents.list" });
  }
  if (Object.hasOwn(agents, "ownership")) {
    delete agents.ownership;
    report.dropped.push({ path: "agents.ownership", reason: "openclaw-only" });
  }
  const defaults = child(agents, "defaults");
  const systemAgent = child(defaults ?? {}, "systemAgent");
  const list = Array.isArray(agents.list) ? agents.list : [];
  const index = list.findIndex(
    (entry) => isPlainObject(entry) && normalizeAgentId(String(entry.id)) === owner,
  );
  if (explicit && defaults && systemAgent && Object.hasOwn(systemAgent, "agentId") && index >= 0) {
    (list[index] as Json).default = true;
    delete defaults.systemAgent;
    report.renamed.push({
      from: "agents.defaults.systemAgent.agentId",
      to: `agents.list[${index}].default`,
    });
  }
}

/** A drop that changes where a binding routes: the binding, its agentId or type, or its match. */
const ROUTE_DROP_RE = /^bindings(\[\d+\](\.(agentId|type)|\.match([.[].*)?)?)?$/;

/**
 * What is written must route as OpenClaw did: no binding lost or rewritten,
 * none naming an agent bot.json lacks (Hanzo Bot would fall back to the
 * default agent), and the default agent is the one OpenClaw gave unbound
 * messages.
 */
function checkRoutes(config: Json, report: ConfigReport, owner: string): void {
  for (const { path } of report.dropped) {
    if (ROUTE_DROP_RE.test(path)) {
      refuseRoute(`${path} was dropped`);
    }
  }
  const cfg = config as BotConfig;
  const listed = Array.isArray(cfg.agents?.list) && cfg.agents.list.length > 0;
  const ids = listAgentIds(cfg);
  const bindings = Array.isArray(config.bindings) ? config.bindings : [];
  bindings.forEach((binding: unknown, index) => {
    const agentId = isPlainObject(binding) ? binding.agentId : undefined;
    if (
      listed &&
      typeof agentId === "string" &&
      agentId.trim() !== "" &&
      !ids.includes(normalizeAgentId(agentId))
    ) {
      refuseRoute(`bindings[${index}] names agent "${agentId}", which bot.json lacks`);
    }
  });
  const got = resolveDefaultAgentId(cfg);
  if (got !== owner) {
    refuseRoute(`the default agent is "${got}", not "${owner}"`);
  }
}

function applyRenames(config: Json, report: ConfigReport, owner: string): void {
  // The meaning of agents.defaults.models depends on OpenClaw's own migration
  // stamp, so read it before meta goes.
  const meta = child(config, "meta");
  const modelsAreCatalog = child(meta ?? {}, "migrations")?.modelPolicyAllowlist === true;
  if (meta) {
    delete config.meta;
    report.dropped.push({ path: "meta", reason: "metadata" });
  }

  const agents = child(config, "agents");
  if (agents) {
    applyRoster(agents, owner, report);
    const defaults = child(agents, "defaults");
    if (defaults) {
      applyModelPolicy(defaults, modelsAreCatalog, report);
      move(
        report,
        defaults,
        "pdfMaxMb",
        "agents.defaults.pdfMaxMb",
        () => defaults,
        "pdfMaxBytesMb",
        "agents.defaults.pdfMaxBytesMb",
      );
      move(
        report,
        defaults,
        "embeddedAgent",
        "agents.defaults.embeddedAgent",
        () => defaults,
        "embeddedPi",
        "agents.defaults.embeddedPi",
      );
    }
    const list = Array.isArray(agents.list) ? agents.list : [];
    list.forEach((entry, index) => {
      if (!isPlainObject(entry)) {
        return;
      }
      const at = `agents.list[${index}]`;
      const memory = child(entry, "memory");
      if (memory) {
        move(
          report,
          memory,
          "search",
          `${at}.memory.search`,
          () => entry,
          "memorySearch",
          `${at}.memorySearch`,
        );
        pruneEmpty(entry, "memory");
      }
      move(
        report,
        entry,
        "embeddedAgent",
        `${at}.embeddedAgent`,
        () => entry,
        "embeddedPi",
        `${at}.embeddedPi`,
      );
    });
  }

  const memory = child(config, "memory");
  if (memory) {
    move(
      report,
      memory,
      "search",
      "memory.search",
      () => ensure(ensure(config, "agents"), "defaults"),
      "memorySearch",
      "agents.defaults.memorySearch",
    );
    pruneEmpty(config, "memory");
  }

  move(report, config, "tts", "tts", () => ensure(config, "messages"), "tts", "messages.tts");
  move(report, config, "attachments", "attachments", () => config, "media", "media");

  const nodes = child(child(config, "gateway") ?? {}, "nodes");
  const commands = nodes ? child(nodes, "commands") : undefined;
  if (nodes && commands) {
    move(
      report,
      commands,
      "allow",
      "gateway.nodes.commands.allow",
      () => nodes,
      "allowCommands",
      "gateway.nodes.allowCommands",
    );
    move(
      report,
      commands,
      "deny",
      "gateway.nodes.commands.deny",
      () => nodes,
      "denyCommands",
      "gateway.nodes.denyCommands",
    );
    pruneEmpty(nodes, "commands");
  }

  const pluginEntries = child(child(config, "plugins") ?? {}, "entries");
  if (pluginEntries) {
    const canvas = child(child(pluginEntries, "canvas") ?? {}, "config");
    if (canvas) {
      move(
        report,
        canvas,
        "host",
        "plugins.entries.canvas.config.host",
        () => config,
        "canvasHost",
        "canvasHost",
      );
    }
    const brave = child(child(child(pluginEntries, "brave") ?? {}, "config") ?? {}, "webSearch");
    if (brave) {
      move(
        report,
        brave,
        "apiKey",
        "plugins.entries.brave.config.webSearch.apiKey",
        () => ensure(ensure(ensure(config, "tools"), "web"), "search"),
        "apiKey",
        "tools.web.search.apiKey",
      );
    }
    for (const [plugin, key] of [["brave", ""], ...WEB_SEARCH_PROVIDERS] as Array<
      [string, string]
    >) {
      const pluginConfig = child(child(pluginEntries, plugin) ?? {}, "config");
      if (!pluginConfig) {
        continue;
      }
      if (key) {
        move(
          report,
          pluginConfig,
          "webSearch",
          `plugins.entries.${plugin}.config.webSearch`,
          () => ensure(ensure(ensure(config, "tools"), "web"), "search"),
          key,
          `tools.web.search.${key}`,
        );
      }
      pruneEmpty(pluginConfig, "webSearch");
    }
    for (const id of ["canvas", "brave", ...WEB_SEARCH_PROVIDERS.map(([plugin]) => plugin)]) {
      const entry = child(pluginEntries, id);
      if (entry) {
        pruneEmpty(entry, "config");
        pruneEmpty(pluginEntries, id);
      }
    }
    const plugins = child(config, "plugins") ?? {};
    pruneEmpty(plugins, "entries");
    pruneEmpty(config, "plugins");
  }

  const profiles = child(child(config, "browser") ?? {}, "profiles");
  const usedColors = new Set(
    Object.values(profiles ?? {})
      .map((profile) => (isPlainObject(profile) ? profile.color : undefined))
      .filter((color): color is string => typeof color === "string")
      .map((color) => color.toUpperCase()),
  );
  for (const [name, profile] of Object.entries(profiles ?? {})) {
    if (!isPlainObject(profile)) {
      continue;
    }
    if (profile.driver === "openclaw") {
      profile.driver = "clawd";
      report.renamed.push({
        from: `browser.profiles.${name}.driver="openclaw"`,
        to: `browser.profiles.${name}.driver="clawd"`,
      });
    }
    // OpenClaw dropped the per-profile color; Hanzo Bot requires one and
    // picks it from the same palette its profile command uses.
    if (typeof profile.color !== "string") {
      const color = allocateColor(usedColors);
      profile.color = color;
      usedColors.add(color.toUpperCase());
    }
  }
}

type ExecPolicy = { security: string; ask: string };

/** The security and ask each OpenClaw exec mode stands for (its doctor's resolveConfiguredExecPolicy). */
const EXEC_MODES = new Map<unknown, ExecPolicy>([
  ["deny", { security: "deny", ask: "off" }],
  ["allowlist", { security: "allowlist", ask: "off" }],
  ["ask", { security: "allowlist", ask: "on-miss" }],
  ["auto", { security: "allowlist", ask: "on-miss" }],
  ["full", { security: "full", ask: "off" }],
]);

const EXEC_DENY: ExecPolicy = { security: "deny", ask: "off" };

/** The values OpenClaw's schema admits for each exec key (ToolExecBaseShape); anything else, null included, it rejects. */
const EXEC_VALUES: Record<ExecField | "host", ReadonlySet<unknown>> = {
  security: new Set(["deny", "allowlist", "full"]),
  ask: new Set(["off", "on-miss", "always"]),
  host: new Set(["auto", "sandbox", "gateway", "node"]),
};

/**
 * Hanzo Bot has no tools.exec.mode, only the security and ask it stands for.
 * In each scope OpenClaw reads (the root, then each agents.list entry; not
 * agents.defaults) the mode becomes security and ask, replacing any beside it:
 * OpenClaw's runtime (applyExecPolicyLayer) and doctor (migrateExecMode) let
 * the mode win. A value OpenClaw's schema rejects kept OpenClaw from loading
 * the config at all, so no exec ran: a mode it rejects, a host it rejects, a
 * security or ask it rejects where no mode is set, and a tools or tools.exec
 * that is not an object each make the scope deny, with a note.
 */
function applyExecPolicy(config: Json, report: ConfigReport): void {
  const scopes: Array<[scope: Json, prefix: string]> = [[config, ""]];
  const list = child(config, "agents")?.list;
  if (Array.isArray(list)) {
    list.forEach((entry, index) => {
      if (isPlainObject(entry)) {
        scopes.push([entry, `agents.list[${index}].`]);
      }
    });
  }
  const keys = ["security", "ask"] as const;
  for (const [scope, prefix] of scopes) {
    const at = `${prefix}tools.exec`;
    // A tools or tools.exec that is not an object: the rename names it.
    let cause: string | undefined;
    if (Object.hasOwn(scope, "tools") && !isPlainObject(scope.tools)) {
      cause = `${prefix}tools=${JSON.stringify(scope.tools)}`;
      report.notes.push({ path: `${prefix}tools`, reason: "exec-invalid" });
      scope.tools = {};
    }
    const tools = child(scope, "tools");
    if (!tools || (!cause && !Object.hasOwn(tools, "exec"))) {
      continue;
    }
    if (!cause && !isPlainObject(tools.exec)) {
      cause = `${at}=${JSON.stringify(tools.exec)}`;
      report.notes.push({ path: at, reason: "exec-invalid" });
    }
    if (!isPlainObject(tools.exec)) {
      tools.exec = {};
    }
    const exec = tools.exec as Json;
    const modeSet = Object.hasOwn(exec, "mode");
    const known = modeSet ? EXEC_MODES.get(exec.mode) : undefined;
    // In order: mode, then (with no mode) security and ask, then host.
    const invalid: Array<"mode" | ExecField | "host"> = [];
    if (modeSet && !known) {
      invalid.push("mode");
    }
    for (const key of modeSet ? (["host"] as const) : (["security", "ask", "host"] as const)) {
      if (Object.hasOwn(exec, key) && !EXEC_VALUES[key].has(exec[key])) {
        invalid.push(key);
      }
    }
    if (!cause && !modeSet && invalid.length === 0) {
      continue;
    }
    const policy = cause || invalid.length > 0 ? EXEC_DENY : (known ?? EXEC_DENY);
    const first = invalid[0] ?? "mode";
    const from = cause ?? `${at}.${first}=${JSON.stringify(exec[first])}`;
    for (const key of keys) {
      if (Object.hasOwn(exec, key) && !invalid.includes(key)) {
        report.dropped.push({
          path: `${at}.${key}`,
          reason: modeSet ? "exec-mode" : "exec-invalid",
        });
      }
    }
    for (const key of invalid) {
      report.notes.push({
        path: `${at}.${key}`,
        reason: key === "mode" ? "exec-mode-unknown" : "exec-invalid",
      });
    }
    delete exec.mode;
    if (invalid.includes("host")) {
      delete exec.host;
    }
    for (const key of keys) {
      delete exec[key];
    }
    for (const key of keys) {
      exec[key] = policy[key];
      report.renamed.push({ from, to: `${at}.${key}="${policy[key]}"` });
    }
  }
}

/**
 * OpenClaw (once meta.migrations.modelPolicyAllowlist is stamped) restricts
 * models with agents.defaults.modelPolicy.allow and uses agents.defaults.models
 * as a catalog. Hanzo Bot restricts with agents.defaults.models itself: a
 * non-empty map is the allowlist.
 */
function applyModelPolicy(defaults: Json, modelsAreCatalog: boolean, report: ConfigReport): void {
  const policy = child(defaults, "modelPolicy");
  const catalog = child(defaults, "models") ?? {};
  if (policy) {
    delete defaults.modelPolicy;
  }
  if (!modelsAreCatalog) {
    return;
  }
  const allow = Array.isArray(policy?.allow)
    ? policy.allow.filter((key): key is string => typeof key === "string")
    : [];
  if (allow.length === 0) {
    if (Object.hasOwn(defaults, "models")) {
      delete defaults.models;
      report.dropped.push({ path: "agents.defaults.models", reason: "model-catalog" });
    }
    return;
  }
  defaults.models = Object.fromEntries(allow.map((key) => [key, catalog[key] ?? {}]));
  report.renamed.push({ from: "agents.defaults.modelPolicy.allow", to: "agents.defaults.models" });
}

/** A load path is carried only when it holds a Hanzo Bot plugin; OpenClaw's plugin SDK is not this one. */
function holdsBotPlugin(entry: unknown, home: string): boolean {
  if (typeof entry !== "string") {
    return false;
  }
  const dir = entry === "~" || entry.startsWith("~/") ? path.join(home, entry.slice(1)) : entry;
  return path.isAbsolute(dir) && fs.existsSync(path.join(dir, PLUGIN_MANIFEST_FILENAME));
}

function applyDrops(config: Json, report: ConfigReport, home: string): void {
  const plugins = child(config, "plugins");
  if (plugins && Object.hasOwn(plugins, "installs")) {
    delete plugins.installs;
    report.dropped.push({ path: "plugins.installs", reason: "plugins" });
  }
  const load = plugins ? child(plugins, "load") : undefined;
  if (load && Array.isArray(load.paths)) {
    const paths: unknown[] = load.paths;
    paths.forEach((entry, index) => {
      if (!holdsBotPlugin(entry, home)) {
        report.dropped.push({ path: `plugins.load.paths[${index}]`, reason: "plugins" });
      }
    });
    const kept = paths.filter((entry) => holdsBotPlugin(entry, home));
    if (kept.length > 0) {
      load.paths = kept;
    } else {
      delete load.paths;
      pruneEmpty(plugins ?? {}, "load");
    }
  }
  pruneEmpty(config, "plugins");
  dropSecretStoreRefs(config, "", report);
}

function dropSecretStoreRefs(value: unknown, path: string, report: ConfigReport): void {
  if (Array.isArray(value)) {
    for (let index = value.length - 1; index >= 0; index -= 1) {
      if (isStoreRef(value[index])) {
        value.splice(index, 1);
        report.dropped.push({ path: `${path}[${index}]`, reason: "secret-store" });
      } else {
        dropSecretStoreRefs(value[index], `${path}[${index}]`, report);
      }
    }
    return;
  }
  if (!isPlainObject(value)) {
    return;
  }
  for (const [key, sub] of Object.entries(value)) {
    const subPath = path ? `${path}.${key}` : key;
    if (isStoreRef(sub)) {
      delete value[key];
      report.dropped.push({ path: subPath, reason: "secret-store" });
    } else {
      dropSecretStoreRefs(sub, subPath, report);
    }
  }
}

function isStoreRef(value: unknown): boolean {
  return isPlainObject(value) && value.source === "store" && typeof value.id === "string";
}

function mapStrings(value: unknown, fn: (text: string) => string): unknown {
  if (typeof value === "string") {
    return fn(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => mapStrings(item, fn));
  }
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, sub]) => [key, mapStrings(sub, fn)]),
    );
  }
  return value;
}

const ENV_REF_RE = /\$\{OPENCLAW_([A-Z0-9_]+)\}/g;

/** Every ${OPENCLAW_X} reference becomes ${BOT_X}, matching the .env rename. */
export function rewriteEnvRefs(text: string): string {
  return text.replace(ENV_REF_RE, "$${BOT_$1}");
}

export function listEnvRefs(value: unknown): string[] {
  const found = new Set<string>();
  mapStrings(value, (text) => {
    for (const match of text.matchAll(/\$\{(BOT_[A-Z0-9_]+)\}/g)) {
      found.add(match[1] ?? "");
    }
    return text;
  });
  return [...found].toSorted();
}

function deleteAt(root: unknown, path: ReadonlyArray<PropertyKey>): boolean {
  let cursor: unknown = root;
  for (const segment of path.slice(0, -1)) {
    cursor =
      Array.isArray(cursor) || isPlainObject(cursor)
        ? (cursor as Json)[segment as string]
        : undefined;
  }
  const last = path[path.length - 1];
  if (Array.isArray(cursor) && typeof last === "number" && last < cursor.length) {
    cursor.splice(last, 1);
    return true;
  }
  if (isPlainObject(cursor) && typeof last === "string" && Object.hasOwn(cursor, last)) {
    delete cursor[last];
    return true;
  }
  return false;
}

export function formatPath(path: ReadonlyArray<PropertyKey>): string {
  let out = "";
  for (const segment of path) {
    if (typeof segment === "number") {
      out += `[${segment}]`;
    } else if (typeof segment === "string") {
      out = out ? `${out}.${segment}` : segment;
    }
  }
  return out;
}

/** "a.b.0.c" (a config issue path) back to segments; numeric segments index arrays. */
function parseIssuePath(label: string): PropertyKey[] {
  return label
    .split(".")
    .filter(Boolean)
    .map((segment) => (/^\d+$/.test(segment) ? Number(segment) : segment));
}

/**
 * Drop what an issue names. A value that is present goes; a required key that
 * is missing takes its parent object with it. Returns the label dropped.
 */
function dropIssue(config: Json, path: PropertyKey[]): string | undefined {
  for (let end = path.length; end > 0; end -= 1) {
    const at = path.slice(0, end);
    if (deleteAt(config, at)) {
      return formatPath(at);
    }
  }
  return undefined;
}

/**
 * The runtime's last word: drop values BotSchema still rejects (deepest
 * first), then whatever the full validator still rejects, then plugin entries
 * naming plugins this runtime does not ship. What is written always loads.
 */
function invalidPaths(config: Json): PropertyKey[][] {
  const parsed = BotSchema.safeParse(config);
  if (!parsed.success) {
    return parsed.error.issues.map((issue) => issue.path);
  }
  const raw = validateConfigObjectRaw(config);
  if (!raw.ok) {
    return raw.issues.map((issue) => parseIssuePath(issue.path));
  }
  // Plugin checks the gateway makes at startup: a load path that holds no
  // Hanzo Bot plugin, an allow list naming a plugin it does not have.
  const withPlugins = validateConfigObjectRawWithPlugins(config);
  return withPlugins.ok ? [] : withPlugins.issues.map((issue) => parseIssuePath(issue.path));
}

function applyValidation(config: Json, report: ConfigReport): void {
  for (let paths = invalidPaths(config); paths.length > 0; paths = invalidPaths(config)) {
    let progressed = false;
    const seen = new Set<string>();
    for (const path of paths.toSorted((a, b) => b.length - a.length)) {
      const label = formatPath(path);
      if (seen.has(label)) {
        continue;
      }
      seen.add(label);
      const dropped = dropIssue(config, [...path]);
      if (dropped) {
        const reason = /^channels\.[^.[]+$/.test(dropped) ? "no-channel" : "invalid";
        report.dropped.push({ path: dropped, reason });
        progressed = true;
      }
    }
    if (!progressed) {
      // Each round removes at least one key, so this ends; an issue naming
      // nothing that can be removed is a validator this importer does not know.
      throw new Error(
        `the converted config does not validate (${paths.map(formatPath).join(", ")}); nothing was written`,
      );
    }
  }
  const pluginEntries = child(child(config, "plugins") ?? {}, "entries");
  if (!pluginEntries) {
    return;
  }
  const result = validateConfigObjectRawWithPlugins(config);
  for (const warning of result.warnings) {
    const id = /^plugins\.entries\.(.+)$/.exec(warning.path)?.[1];
    if (id && warning.message.startsWith("plugin not found") && Object.hasOwn(pluginEntries, id)) {
      delete pluginEntries[id];
      report.dropped.push({ path: `plugins.entries.${id}`, reason: "no-plugin" });
    }
  }
}

export function convertConfig(params: {
  source: Json;
  rewrite: PathRewriter;
  /** Home dir, for `~/…` plugin load paths. */
  home: string;
  /** OpenClaw's exec approvals policies, folded into tools.exec. */
  approvals?: ApprovalsSource[];
}): { config: Json; report: ConfigReport } {
  const config = structuredClone(params.source);
  const report: ConfigReport = {
    renamed: [],
    dropped: [],
    notes: [],
    approvals: { tightened: [], closed: [] },
  };
  const owner = rosterOwner(config);
  applyRenames(config, report, owner);
  applyExecPolicy(config, report);
  report.approvals = foldApprovals(config, params.approvals ?? []);
  applyDrops(config, report, params.home);
  const rewritten = mapStrings(config, (text) => rewriteEnvRefs(params.rewrite(text))) as Json;
  const pruned = pruneToTree(rewritten, botConfigKeyTree());
  for (const path of pruned.dropped) {
    report.dropped.push({ path, reason: "openclaw-only" });
  }
  const result = pruned.value as Json;
  applyValidation(result, report);
  checkRoutes(result, report, owner);
  return { config: result, report };
}

export type KeyPath = string[];

/**
 * Merge the converted config beneath an existing bot.json: every value the
 * existing file sets is kept; objects merge key by key; arrays and scalars
 * already present are never replaced. Returns the paths it added and the
 * paths where the existing value differs and was kept.
 */
export function mergeBeneath(
  existing: Json,
  incoming: Json,
  at: KeyPath = [],
): { added: KeyPath[]; kept: KeyPath[] } {
  const added: KeyPath[] = [];
  const kept: KeyPath[] = [];
  for (const [key, value] of Object.entries(incoming)) {
    const sub = [...at, key];
    if (!Object.hasOwn(existing, key)) {
      existing[key] = value;
      added.push(sub);
      continue;
    }
    const current = existing[key];
    if (isPlainObject(current) && isPlainObject(value)) {
      const inner = mergeBeneath(current, value, sub);
      added.push(...inner.added);
      kept.push(...inner.kept);
    } else if (!isDeepStrictEqual(current, value)) {
      kept.push(sub);
    }
  }
  return { added, kept };
}

/** The first agents.list entry for an agent id, as Hanzo Bot finds it (resolveAgentEntry). */
function agentEntryIndex(config: Json, agentId: string): number {
  const list = child(config, "agents")?.list;
  if (!Array.isArray(list)) {
    return -1;
  }
  return list.findIndex(
    (entry) =>
      isPlainObject(entry) &&
      normalizeAgentId(typeof entry.id === "string" ? entry.id : undefined) === agentId,
  );
}

/** The security or ask Hanzo Bot runs an agent with (resolveExecConfig): the agent's own, else the root's. */
export function execValue(config: Json, agentId: string, field: ExecField): unknown {
  const list = child(config, "agents")?.list;
  const index = agentEntryIndex(config, agentId);
  const entry = Array.isArray(list) && index >= 0 ? (list[index] as Json) : {};
  const own = child(child(entry, "tools") ?? {}, "exec")?.[field];
  return own ?? child(child(config, "tools") ?? {}, "exec")?.[field];
}

function bindingsOf(config: Json): unknown[] {
  return Array.isArray(config.bindings) ? config.bindings : [];
}

/**
 * A merge keeps bot.json's own values, its agents.list and exec settings
 * included, and adds OpenClaw's channels and bindings, so OpenClaw's senders
 * reach agents whose exec OpenClaw never gave them. Each agent the merged file
 * runs is held, field by field, to no looser than:
 *   - what the import alone (`fresh`) gives the same agent id, where the
 *     import runs that agent;
 *   - where the merged file routes otherwise than the import (other bindings,
 *     another default agent, or an agent of the import it does not list) and
 *     the agent is the merged default or one a binding the import lacks names:
 *     the strictest any agent of the import runs.
 * Unset is loosest. A looser value is replaced on the agent's first
 * agents.list entry, or on the root where there is none. Returns what it
 * wrote, one entry per tools.exec it changed.
 */
export function boundMergedExec(merged: Json, fresh: Json): Array<{ at: string; names: string[] }> {
  const freshIds = listAgentIds(fresh as BotConfig);
  const mergedIds = listAgentIds(merged as BotConfig);
  const defaultId = resolveDefaultAgentId(merged as BotConfig);
  const freshBindings = bindingsOf(fresh);
  const mergedBindings = bindingsOf(merged);
  const rerouted =
    !isDeepStrictEqual(mergedBindings, freshBindings) ||
    defaultId !== resolveDefaultAgentId(fresh as BotConfig) ||
    freshIds.some((id) => !mergedIds.includes(id));
  const foreign = new Set<string>();
  for (const binding of mergedBindings) {
    if (
      isPlainObject(binding) &&
      typeof binding.agentId === "string" &&
      !freshBindings.some((other) => isDeepStrictEqual(other, binding))
    ) {
      foreign.add(normalizeAgentId(binding.agentId));
    }
  }
  const written: Array<{ at: string; names: string[] }> = [];
  for (const id of mergedIds) {
    const index = agentEntryIndex(merged, id);
    const list = child(merged, "agents")?.list;
    const scope = Array.isArray(list) && index >= 0 ? (list[index] as Json) : merged;
    const at = index >= 0 ? `agents.list[${index}].tools.exec` : "tools.exec";
    const names: string[] = [];
    for (const field of EXEC_FIELDS) {
      let target = freshIds.includes(id) ? execValue(fresh, id, field) : undefined;
      if (rerouted && (id === defaultId || foreign.has(id))) {
        for (const other of freshIds) {
          target = stricter(field, target, execValue(fresh, other, field));
        }
      }
      if (target === undefined || !looser(field, execValue(merged, id, field), target)) {
        continue;
      }
      const tools = child(scope, "tools") ?? {};
      scope.tools = tools;
      const exec = child(tools, "exec") ?? {};
      tools.exec = exec;
      exec[field] = target;
      names.push(`${field}=${JSON.stringify(target)}`);
    }
    if (names.length > 0) {
      written.push({ at, names });
    }
  }
  return written;
}

/**
 * The agents of the import (`fresh`) that the written bot.json runs with no
 * tools.exec.security. OpenClaw's default is full, so OpenClaw ran exec for
 * them; Hanzo Bot denies host exec without a security.
 */
export function execUnset(written: Json, fresh: Json): string[] {
  const runs = listAgentIds(written as BotConfig);
  return listAgentIds(fresh as BotConfig).filter(
    (id) => runs.includes(id) && execValue(written, id, "security") === undefined,
  );
}

export function valueAt(root: unknown, at: KeyPath): unknown {
  let cursor = root;
  for (const key of at) {
    cursor = isPlainObject(cursor) ? cursor[key] : undefined;
  }
  return cursor;
}

function prune(root: Json, at: KeyPath): void {
  for (let end = at.length - 1; end > 0; end -= 1) {
    const parent = valueAt(root, at.slice(0, end - 1));
    const key = at[end - 1] ?? "";
    if (
      isPlainObject(parent) &&
      isPlainObject(parent[key]) &&
      Object.keys(parent[key]).length === 0
    ) {
      delete parent[key];
    }
  }
}

/**
 * Hanzo Bot's first run writes a starter config (Run Locally's
 * hanzoCloudConfig). A value of it still in bot.json was chosen by nobody, so
 * the OpenClaw value for the same key replaces it. Its Anthropic route through
 * the Hanzo proxy goes only when the import brings the person's own Anthropic
 * key, which OpenClaw sent to Anthropic. Returns the keys given way.
 */
export function yieldStarter(
  existing: Json,
  starter: Json,
  incoming: Json,
  opts: { anthropic: boolean },
): string[] {
  const leaves: KeyPath[] = [
    ["gateway", "mode"],
    ["gateway", "bind"],
    ["agents", "defaults", "workspace"],
  ];
  const yielded: string[] = [];
  for (const at of leaves) {
    const value = valueAt(existing, at);
    if (
      value !== undefined &&
      isDeepStrictEqual(value, valueAt(starter, at)) &&
      valueAt(incoming, at) !== undefined &&
      !isDeepStrictEqual(value, valueAt(incoming, at))
    ) {
      deleteAt(existing, at);
      yielded.push(formatPath(at));
    }
  }
  const anthropic: KeyPath = ["models", "providers", "anthropic"];
  if (
    opts.anthropic &&
    isDeepStrictEqual(valueAt(existing, anthropic), valueAt(starter, anthropic))
  ) {
    deleteAt(existing, anthropic);
    prune(existing, anthropic);
    yielded.push(formatPath(anthropic));
  }
  return yielded;
}

function isPrefix(prefix: readonly string[], at: readonly string[]): boolean {
  return prefix.length <= at.length && prefix.every((key, index) => at[index] === key);
}

/**
 * The merged bot.json must load wherever the existing one did. For an issue
 * the merge introduced, the added keys nearest to it are candidates (those in
 * the object it names, else in its parent, and so on); the one whose removal
 * clears the most issues goes, or all of them when none helps alone. Returns
 * the labels dropped; throws when nothing added is left to drop.
 */
export function validateMerge(merged: Json, before: Json, added: KeyPath[]): string[] {
  const known = new Set(invalidPaths(before).map(formatPath));
  const fresh = (config: Json) =>
    invalidPaths(config).filter((issue) => !known.has(formatPath(issue)));
  const dropped: string[] = [];
  let remaining = [...added];
  for (let issues = fresh(merged); issues.length > 0; issues = fresh(merged)) {
    const near = new Set<KeyPath>();
    for (const issue of issues) {
      for (let depth = issue.length - 1; depth >= 0; depth -= 1) {
        const scope = issue.slice(0, depth).map(String);
        const hits = remaining.filter((at) => isPrefix(scope, at) || isPrefix(at, scope));
        if (hits.length > 0) {
          hits.forEach((at) => near.add(at));
          break;
        }
      }
    }
    if (near.size === 0) {
      throw new Error(
        `bot.json would not load after the merge (${issues.map(formatPath).join(", ")}); nothing was written`,
      );
    }
    let best: KeyPath | undefined;
    let fewest = issues.length;
    for (const at of near) {
      const trial = structuredClone(merged);
      deleteAt(trial, at);
      const left = fresh(trial).length;
      if (left < fewest) {
        best = at;
        fewest = left;
      }
    }
    const drop = best ? [best] : [...near];
    for (const at of drop) {
      deleteAt(merged, at);
      dropped.push(formatPath(at));
    }
    remaining = remaining.filter((at) => !drop.includes(at));
  }
  return dropped;
}
