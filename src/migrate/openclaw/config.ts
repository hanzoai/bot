import fs from "node:fs";
import path from "node:path";
import { allocateColor } from "../../browser/profiles.js";
import {
  validateConfigObjectRaw,
  validateConfigObjectRawWithPlugins,
} from "../../config/validation.js";
import { BotSchema } from "../../config/zod-schema.js";
import { PLUGIN_MANIFEST_FILENAME } from "../../plugins/manifest.js";
import { botConfigKeyTree, pruneToTree } from "./keys.js";
import type { PathRewriter } from "./paths.js";

/**
 * openclaw.json → bot.json, in five steps, each reported:
 *   1. renames: settings OpenClaw moved after Hanzo Bot forked from it go back
 *      to where Hanzo Bot reads them
 *   2. drops: settings that name OpenClaw-only machinery (plugin installs,
 *      secret-store refs, write stamps)
 *   3. paths: strings naming the OpenClaw state dir name the Hanzo Bot one
 *   4. prune: keys bot.json does not admit are dropped
 *   5. validate: values the runtime still rejects are dropped
 * docs/install/migrate-from-openclaw.md states the mapping for people.
 */

type Json = Record<string, unknown>;

export type ConfigDropReason =
  | "metadata"
  | "plugins"
  | "secret-store"
  | "model-catalog"
  | "superseded"
  | "openclaw-only"
  | "invalid"
  | "no-plugin";

export type ConfigReport = {
  renamed: Array<{ from: string; to: string }>;
  dropped: Array<{ path: string; reason: ConfigDropReason }>;
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

function applyRenames(config: Json, report: ConfigReport): void {
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
    const entries = child(agents, "entries");
    if (entries) {
      const list = Array.isArray(agents.list) ? agents.list : [];
      for (const [id, entry] of Object.entries(entries)) {
        list.push({ id, ...(isPlainObject(entry) ? entry : {}) });
      }
      agents.list = list;
      delete agents.entries;
      report.renamed.push({ from: "agents.entries", to: "agents.list" });
    }
    if (Object.hasOwn(agents, "ownership")) {
      delete agents.ownership;
      report.dropped.push({ path: "agents.ownership", reason: "openclaw-only" });
    }
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
        report.dropped.push({ path: dropped, reason: "invalid" });
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
}): { config: Json; report: ConfigReport } {
  const report: ConfigReport = { renamed: [], dropped: [] };
  const config = structuredClone(params.source);
  applyRenames(config, report);
  applyDrops(config, report, params.home);
  const rewritten = mapStrings(config, (text) => rewriteEnvRefs(params.rewrite(text))) as Json;
  const pruned = pruneToTree(rewritten, botConfigKeyTree());
  for (const path of pruned.dropped) {
    report.dropped.push({ path, reason: "openclaw-only" });
  }
  const result = pruned.value as Json;
  applyValidation(result, report);
  return { config: result, report };
}

/**
 * Merge the converted config beneath an existing bot.json: every value the
 * existing file sets is kept; objects merge key by key; arrays and scalars
 * already present are never replaced. Returns the dotted paths it added.
 */
export function mergeBeneath(existing: Json, incoming: Json, path = ""): string[] {
  const added: string[] = [];
  for (const [key, value] of Object.entries(incoming)) {
    const sub = path ? `${path}.${key}` : key;
    if (!Object.hasOwn(existing, key)) {
      existing[key] = value;
      added.push(sub);
      continue;
    }
    const current = existing[key];
    if (isPlainObject(current) && isPlainObject(value)) {
      added.push(...mergeBeneath(current, value, sub));
    }
  }
  return added;
}
