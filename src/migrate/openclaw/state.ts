import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import JSON5 from "json5";
import { resolveConfigIncludes } from "../../config/includes.js";
import { SAFE_SESSION_ID_RE } from "../../config/sessions/paths.js";
import { expandHomePrefix, resolveRequiredHomeDir } from "../../infra/home-dir.js";
import { decodeTranscriptEvent, withOpenClawDb, type OpenClawDb } from "./sqlite.js";

/**
 * Everything the importer reads from an OpenClaw state dir, in one neutral
 * shape. Two layouts exist: the file layout (OpenClaw before its state moved
 * into SQLite, the layout Hanzo Bot forked from) and the database layout
 * (state/openclaw.sqlite + agents/<id>/agent/openclaw-agent.sqlite). Where a
 * database holds a kind of state, it is authoritative for that kind.
 */

type Json = Record<string, unknown>;

export type AuthBlobs = { store?: Json; state?: Json; from: string };

export type SessionWindow = {
  sessionId: string;
  updatedAt: number;
  current: boolean;
  lines: string[];
};

export type AgentSessions = {
  from: string;
  entries: Record<string, Json>;
  windows: SessionWindow[];
  /** File layout: transcripts copied from disk, by session id. */
  files: Record<string, string>;
};

export type CronSource = { from: string; jobs: Json[] };
export type PairingSource = { from: string; lists: Record<string, string[]> };

export type OpenClawState = {
  dir: string;
  configFile: string | null;
  config: Json;
  sharedAuth: AuthBlobs | null;
  agentAuth: Record<string, AuthBlobs>;
  sessions: Record<string, AgentSessions>;
  cron: CronSource | null;
  pairing: PairingSource | null;
  hookInstalls: Json | null;
  pluginInstalls: string[];
  pairedDevices: number;
  /** An agent's heartbeat checklist, by agent id: OpenClaw moved HEARTBEAT.md into cron_job_scratch. */
  heartbeats: Record<string, string>;
};

export const CONFIG_FILENAMES = ["openclaw.json", "clawdbot.json"] as const;

/**
 * Where OpenClaw keeps its state, by OpenClaw's own rules: $OPENCLAW_STATE_DIR,
 * else ~/.openclaw, where ~ is $OPENCLAW_HOME or the user's home ($BOT_HOME is
 * Hanzo Bot's and does not move OpenClaw). `openclaw --profile <name>` sets
 * OPENCLAW_STATE_DIR itself; $OPENCLAW_PROFILE alone does not move the state
 * dir, so a profile install is imported with --from ~/.openclaw-<name>.
 */
export function resolveOpenClawStateDir(env: NodeJS.ProcessEnv = process.env): string {
  const home = env.OPENCLAW_HOME?.trim() || resolveRequiredHomeDir({ HOME: env.HOME }, os.homedir);
  const explicit = env.OPENCLAW_STATE_DIR?.trim();
  if (explicit) {
    return path.resolve(expandHomePrefix(explicit, { home }));
  }
  return path.join(home, ".openclaw");
}
export const STATE_DB = "state/openclaw.sqlite";
export const AGENT_DB = "openclaw-agent.sqlite";

function isPlainObject(value: unknown): value is Json {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseJson(text: string | undefined): Json | undefined {
  if (!text) {
    return undefined;
  }
  const value = JSON.parse(text) as unknown;
  return isPlainObject(value) ? value : undefined;
}

function readJsonFile(file: string): Json | undefined {
  return fs.existsSync(file) ? parseJson(fs.readFileSync(file, "utf8")) : undefined;
}

export function findConfigFile(dir: string): string | null {
  for (const name of CONFIG_FILENAMES) {
    const file = path.join(dir, name);
    if (fs.existsSync(file)) {
      return file;
    }
  }
  return null;
}

function readConfig(file: string | null): Json {
  if (!file) {
    return {};
  }
  const raw: unknown = JSON5.parse(fs.readFileSync(file, "utf8"));
  const resolved = resolveConfigIncludes(raw, file);
  if (!isPlainObject(resolved)) {
    throw new Error(`${file} is not a JSON object`);
  }
  return resolved;
}

function machineState(db: OpenClawDb, key: string): Json | undefined {
  if (!db.hasTable("config_machine_state")) {
    return undefined;
  }
  const rows = db.all<{ value_json: string }>(
    "SELECT value_json FROM config_machine_state WHERE state_key = ?",
    key,
  );
  return parseJson(rows[0]?.value_json);
}

function readStateDb(dir: string, state: OpenClawState): void {
  const file = path.join(dir, STATE_DB);
  if (!fs.existsSync(file)) {
    return;
  }
  withOpenClawDb(file, (db) => {
    const store = machineState(db, "authProfiles.store");
    const authState = machineState(db, "authProfiles.state");
    if (store || authState) {
      state.sharedAuth = {
        store,
        state: authState,
        from: `${STATE_DB}#config_machine_state/authProfiles`,
      };
    }
    state.hookInstalls = machineState(db, "hooks.internal.installs") ?? null;
    const index = machineState(db, "plugins.installedIndex");
    const records = isPlainObject(index?.index) ? index.index.installRecords : undefined;
    if (isPlainObject(records)) {
      state.pluginInstalls = Object.keys(records).toSorted();
    }
    if (db.hasTable("cron_jobs")) {
      const rows = db.all<{ job_json: string }>(
        "SELECT job_json FROM cron_jobs ORDER BY store_key, sort_order, job_id",
      );
      state.cron = {
        from: `${STATE_DB}#cron_jobs`,
        jobs: rows.map((row) => parseJson(row.job_json)).filter((job): job is Json => !!job),
      };
    }
    if (db.hasTable("cron_job_scratch") && db.hasTable("cron_jobs")) {
      const rows = db.all<{ declaration_key: string; content: string }>(
        "SELECT j.declaration_key, s.content FROM cron_job_scratch s JOIN cron_jobs j ON j.store_key = s.store_key AND j.job_id = s.job_id WHERE j.declaration_key LIKE 'heartbeat:%' AND s.content IS NOT NULL",
      );
      for (const row of rows) {
        state.heartbeats[row.declaration_key.slice("heartbeat:".length)] = row.content;
      }
    }
    if (db.hasTable("channel_pairing_allow_entries")) {
      const rows = db.all<{ channel_key: string; account_id: string; entry: string }>(
        "SELECT channel_key, account_id, entry FROM channel_pairing_allow_entries ORDER BY channel_key, account_id, sort_order, entry",
      );
      if (rows.length > 0) {
        const lists: Record<string, string[]> = {};
        for (const row of rows) {
          const key = `${row.channel_key}\u0000${row.account_id}`;
          (lists[key] ??= []).push(row.entry);
        }
        state.pairing = { from: `${STATE_DB}#channel_pairing_allow_entries`, lists };
      }
    }
    if (db.hasTable("device_pairing_paired")) {
      const rows = db.all<{ n: number }>("SELECT count(*) AS n FROM device_pairing_paired");
      state.pairedDevices += rows[0]?.n ?? 0;
    }
  });
}

function readAgentDb(dir: string, agentId: string, state: OpenClawState): boolean {
  const rel = `agents/${agentId}/agent/${AGENT_DB}`;
  const file = path.join(dir, rel);
  if (!fs.existsSync(file)) {
    return false;
  }
  withOpenClawDb(file, (db) => {
    const store = db.hasTable("auth_profile_store")
      ? parseJson(
          db.all<{ store_json: string }>(
            "SELECT store_json FROM auth_profile_store WHERE store_key = 'primary'",
          )[0]?.store_json,
        )
      : undefined;
    const authState = db.hasTable("auth_profile_state")
      ? parseJson(
          db.all<{ state_json: string }>(
            "SELECT state_json FROM auth_profile_state WHERE state_key = 'primary'",
          )[0]?.state_json,
        )
      : undefined;
    if (store || authState) {
      state.agentAuth[agentId] = { store, state: authState, from: `${rel}#auth_profile_store` };
    }
    if (!db.hasTable("session_nodes")) {
      return;
    }
    const sessions: AgentSessions = {
      from: `${rel}#session_nodes`,
      entries: {},
      windows: [],
      files: {},
    };
    const nodes = db.all<{ session_key: string; current_session_id: string; entry_json: string }>(
      "SELECT session_key, current_session_id, entry_json FROM session_nodes ORDER BY session_key",
    );
    const current = new Set<string>();
    for (const node of nodes) {
      const entry = parseJson(node.entry_json) ?? {};
      sessions.entries[node.session_key] = { ...entry, sessionId: node.current_session_id };
      current.add(node.current_session_id);
    }
    if (db.hasTable("session_windows") && db.hasTable("transcript_events")) {
      const windows = db.all<{ session_id: string; updated_at: number }>(
        "SELECT session_id, updated_at FROM session_windows ORDER BY session_id",
      );
      for (const window of windows) {
        const events = db.all<{
          event_json: string | null;
          event_zstd: Uint8Array | null;
          event_utf8_bytes: number | null;
        }>(
          "SELECT event_json, event_zstd, event_utf8_bytes FROM transcript_events WHERE session_id = ? ORDER BY seq",
          window.session_id,
        );
        if (events.length === 0) {
          continue;
        }
        sessions.windows.push({
          sessionId: window.session_id,
          updatedAt: window.updated_at,
          current: current.has(window.session_id),
          lines: events.map((event) => decodeTranscriptEvent(event)),
        });
      }
    }
    state.sessions[agentId] = sessions;
  });
  return true;
}

function readAgentFiles(dir: string, agentId: string, state: OpenClawState): void {
  const agentDir = path.join(dir, "agents", agentId, "agent");
  if (!state.agentAuth[agentId]) {
    const store = readJsonFile(path.join(agentDir, "auth-profiles.json"));
    const authState = readJsonFile(path.join(agentDir, "auth-state.json"));
    if (store || authState) {
      state.agentAuth[agentId] = {
        store,
        state: authState,
        from: `agents/${agentId}/agent/auth-profiles.json`,
      };
    }
  }
  if (state.sessions[agentId]) {
    return;
  }
  const sessionsDir = path.join(dir, "agents", agentId, "sessions");
  const store = readJsonFile(path.join(sessionsDir, "sessions.json"));
  if (!store) {
    return;
  }
  const sessions: AgentSessions = {
    from: `agents/${agentId}/sessions/sessions.json`,
    entries: {},
    windows: [],
    files: {},
  };
  for (const [key, value] of Object.entries(store)) {
    if (!isPlainObject(value) || typeof value.sessionId !== "string") {
      continue;
    }
    sessions.entries[key] = value;
    if (!SAFE_SESSION_ID_RE.test(value.sessionId)) {
      continue;
    }
    const transcript = path.join(sessionsDir, `${value.sessionId}.jsonl`);
    if (fs.existsSync(transcript)) {
      sessions.files[value.sessionId] = transcript;
    }
  }
  state.sessions[agentId] = sessions;
}

function readFileLayout(dir: string, state: OpenClawState): void {
  if (!state.cron) {
    const jobs = readJsonFile(path.join(dir, "cron", "jobs.json"));
    if (jobs && Array.isArray(jobs.jobs)) {
      state.cron = { from: "cron/jobs.json", jobs: jobs.jobs.filter(isPlainObject) };
    }
  }
  const paired = readJsonFile(path.join(dir, "devices", "paired.json"));
  if (paired) {
    state.pairedDevices += Object.keys(paired).length;
  }
}

export function listAgentIds(dir: string): string[] {
  const agentsDir = path.join(dir, "agents");
  if (!fs.existsSync(agentsDir)) {
    return [];
  }
  return fs
    .readdirSync(agentsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .toSorted();
}

export function readOpenClawState(dir: string): OpenClawState {
  const configFile = findConfigFile(dir);
  const state: OpenClawState = {
    dir,
    configFile,
    config: readConfig(configFile),
    sharedAuth: null,
    agentAuth: {},
    sessions: {},
    cron: null,
    pairing: null,
    hookInstalls: null,
    pluginInstalls: [],
    pairedDevices: 0,
    heartbeats: {},
  };
  readStateDb(dir, state);
  for (const agentId of listAgentIds(dir)) {
    readAgentDb(dir, agentId, state);
    readAgentFiles(dir, agentId, state);
  }
  readFileLayout(dir, state);
  return state;
}
