import fs from "node:fs";
import path from "node:path";
import type { MigrationParams, PlanItem } from "./plan.js";
import type { OpenClawState } from "./state.js";

/**
 * What stays behind, and what the person has to do by hand. Every top-level
 * entry of the OpenClaw state dir that the importer does not read or copy is
 * listed once, with the reason it is not carried.
 */

type Json = Record<string, unknown>;

/** Entries the importer reads or copies. */
const CONSUMED = new Set([
  "openclaw.json",
  ".env",
  "state",
  "agents",
  "workspace",
  "skills",
  "hooks",
  "tools",
  "credentials",
]);

const REASONS: Array<[RegExp, string]> = [
  [/^(openclaw|clawdbot)\.json\.(bak(\.\d+)?|pre-update)$/, "backup"],
  [/^clawdbot\.json$/, "backup"],
  [/^(extensions|npm|npm-runtime|git|plugin-skills|plugins)$/, "plugins"],
  [/^(identity|devices|nodes)$/, "devices"],
  [/^exec-approvals\.(json|sock)$/, "approvals"],
  [/^(memory|qmd)$/, "index"],
];

function reasonFor(name: string): string {
  for (const [pattern, reason] of REASONS) {
    if (pattern.test(name)) {
      return reason;
    }
  }
  return "runtime";
}

function isPlainObject(value: unknown): value is Json {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function planSkips(p: MigrationParams, state: OpenClawState, config: Json): PlanItem[] {
  const items: PlanItem[] = [];
  const configName = state.configFile ? path.basename(state.configFile) : "openclaw.json";
  const cronFromFile = state.cron?.from === "cron/jobs.json";
  for (const name of fs.readdirSync(p.source).toSorted()) {
    if (CONSUMED.has(name) || name === configName || name.startsWith("workspace-")) {
      continue;
    }
    if (name === "cron" && cronFromFile) {
      continue;
    }
    items.push({ op: "skip", from: name, reason: reasonFor(name) });
  }

  const plugins = new Set(state.pluginInstalls);
  const installs = (state.config.plugins as Json | undefined)?.installs;
  if (isPlainObject(installs)) {
    for (const id of Object.keys(installs)) {
      plugins.add(id);
    }
  }
  if (plugins.size > 0) {
    items.push({ op: "skip", from: "plugins", reason: "plugins", names: [...plugins].toSorted() });
  }

  items.push({ op: "note", from: "gateway", reason: "stop-openclaw" });
  if (fs.existsSync(path.join(p.source, "credentials", "whatsapp"))) {
    items.push({ op: "note", from: "credentials/whatsapp", reason: "single-session" });
  }
  const channels = isPlainObject(config.channels) ? config.channels : {};
  if (isPlainObject(channels.signal)) {
    items.push({ op: "note", from: "channels.signal", reason: "external" });
  }
  const dbLayout = fs.existsSync(path.join(p.source, "state", "openclaw.sqlite"));
  for (const channel of ["matrix", "zalouser"]) {
    if (dbLayout && isPlainObject(channels[channel])) {
      items.push({ op: "note", from: `channels.${channel}`, reason: "relogin" });
    }
  }
  if (state.pairedDevices > 0) {
    items.push({ op: "note", from: "devices", reason: "repair", count: state.pairedDevices });
  }
  return items;
}
