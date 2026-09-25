import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { requireNodeSqlite } from "../../memory/sqlite.js";

/**
 * OpenClaw state dirs for tests, in both layouts the importer reads. Table and
 * column names are OpenClaw's (src/state/openclaw-*-schema.sql, 2026.9.6),
 * cut to the columns the importer reads plus the ones OpenClaw requires.
 * Every credential value is a marker string, so a test can assert none leaks.
 */

export const SECRETS = {
  anthropicKey: "test-anthropic-key-0001",
  openaiKey: "test-openai-key-0002",
  gatewayToken: "test-gateway-token-0003",
  telegramToken: "123456:test-telegram-token-0004",
  whatsappCreds: "test-whatsapp-creds-0005",
  braveKey: "test-brave-key-0006",
} as const;

function write(file: string, content: string, mode = 0o644): void {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, content, { mode });
  fs.chmodSync(file, mode);
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

const SKILL_MD = `---
name: weather-plus
description: Forecasts with more detail.
metadata: {"openclaw":{"requires":{"bins":["curl"]}}}
---

# Weather plus
`;

function writeWorkspace(dir: string): void {
  write(path.join(dir, "workspace", "AGENTS.md"), "# Agents\n");
  write(path.join(dir, "workspace", "memory", "2026-09-01.md"), "Remember the milk.\n");
  write(path.join(dir, "workspace", "skills", "weather-plus", "SKILL.md"), SKILL_MD);
  write(
    path.join(dir, "workspace", "skills", "weather-plus", ".clawhub", "origin.json"),
    json({ version: 1, registry: "https://clawhub.ai", slug: "weather-plus" }),
  );
  write(
    path.join(dir, "workspace", ".clawhub", "lock.json"),
    json({ version: 1, skills: { "weather-plus": { version: "1.0.0" } } }),
  );
  write(
    path.join(dir, "credentials", "whatsapp", "default", "creds.json"),
    json({ noiseKey: SECRETS.whatsappCreds }),
    0o600,
  );
}

/** The file layout: OpenClaw before its state moved into SQLite. */
export function writeFileLayout(dir: string): void {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  write(
    path.join(dir, "openclaw.json"),
    `// OpenClaw config (JSON5)
{
  meta: { lastTouchedVersion: "2026.2.1" },
  agents: {
    defaults: { workspace: "~/.openclaw/workspace", model: { primary: "anthropic/claude-opus-4-6" } },
    list: [{ id: "main" }, { id: "work" }],
  },
  channels: {
    telegram: { botToken: "${SECRETS.telegramToken}", dmPolicy: "pairing" },
    whatsapp: { allowFrom: ["+15550001111"] },
  },
  gateway: { mode: "local", port: 18789, auth: { mode: "token", token: "\${OPENCLAW_GATEWAY_TOKEN}" } },
  plugins: {
    installs: { "voice-x": { source: "npm", spec: "voice-x@1.0.0" } },
    load: { paths: ["~/.openclaw/extensions/voice-x", "/opt/shared-plugins/y"] },
  },
  somethingOpenClawAdded: { enabled: true },
}
`,
    0o600,
  );
  write(path.join(dir, "openclaw.json.bak"), "{}\n", 0o600);
  write(
    path.join(dir, ".env"),
    `OPENCLAW_GATEWAY_TOKEN=${SECRETS.gatewayToken}\nexport ANTHROPIC_API_KEY="${SECRETS.anthropicKey}"\nOPENCLAW_STATE_DIR=~/.openclaw\n`,
    0o600,
  );
  writeWorkspace(dir);
  write(path.join(dir, "workspace-work", "AGENTS.md"), "# Work agent\n");
  write(path.join(dir, "skills", "managed-one", "SKILL.md"), "---\nname: managed-one\n---\n");
  write(
    path.join(dir, "credentials", "telegram-allowFrom.json"),
    json({ version: 1, allowFrom: ["111"] }),
    0o600,
  );
  write(
    path.join(dir, "agents", "main", "agent", "auth-profiles.json"),
    json({
      version: 1,
      profiles: {
        "anthropic:default": { type: "api_key", provider: "anthropic", key: SECRETS.anthropicKey },
      },
      lastGood: { anthropic: "anthropic:default" },
      usageStats: { "anthropic:default": { errorCount: 2 } },
    }),
    0o600,
  );
  write(
    path.join(dir, "agents", "main", "sessions", "sessions.json"),
    json({
      "agent:main:main": {
        sessionId: "s-file-1",
        updatedAt: 1_790_000_000_000,
        model: "claude-opus-4-6",
        skillsSnapshot: { prompt: "OpenClaw's own skill list" },
        sessionFile: "/elsewhere/s-file-1.jsonl",
      },
      "agent:main:bad": { sessionId: "../../escape", updatedAt: 1 },
    }),
  );
  write(
    path.join(dir, "agents", "main", "sessions", "s-file-1.jsonl"),
    `${JSON.stringify({ type: "session", version: 3, id: "s-file-1" })}\n`,
  );
  write(
    path.join(dir, "cron", "jobs.json"),
    json({
      version: 1,
      jobs: [
        {
          id: "job-daily",
          name: "daily digest",
          enabled: true,
          createdAtMs: 1_790_000_000_000,
          updatedAtMs: 1_790_000_000_000,
          schedule: { kind: "cron", expr: "0 9 * * *", tz: "UTC" },
          sessionTarget: "isolated",
          wakeMode: "now",
          payload: { kind: "agentTurn", message: "digest", toolsAllow: ["*"] },
          state: { lastRunAtMs: 5 },
        },
      ],
    }),
  );
  write(path.join(dir, "devices", "paired.json"), json({ "device-a": {}, "device-b": {} }), 0o600);
  write(path.join(dir, "identity", "device.json"), json({ id: "x" }), 0o600);
  write(path.join(dir, "extensions", "voice-x", "package.json"), json({ name: "voice-x" }));
}

type Db = InstanceType<typeof import("node:sqlite").DatabaseSync>;

function openDb(file: string): Db {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const { DatabaseSync } = requireNodeSqlite();
  const db = new DatabaseSync(file);
  // OpenClaw runs its databases in WAL mode; keep committed pages in the -wal
  // file so a reader that ignores it would miss them.
  db.exec("PRAGMA journal_mode = WAL; PRAGMA wal_autocheckpoint = 0;");
  return db;
}

const STATE_SCHEMA = `
CREATE TABLE config_machine_state (
  state_key TEXT NOT NULL PRIMARY KEY, value_json TEXT NOT NULL, updated_at_ms INTEGER NOT NULL
) STRICT;
CREATE TABLE cron_jobs (
  store_key TEXT NOT NULL, job_id TEXT NOT NULL, declaration_key TEXT, name TEXT NOT NULL,
  enabled INTEGER NOT NULL, agent_id TEXT, payload_kind TEXT NOT NULL, job_json TEXT NOT NULL,
  state_json TEXT NOT NULL DEFAULT '{}', sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL, PRIMARY KEY (store_key, job_id)
) STRICT;
CREATE TABLE channel_pairing_allow_entries (
  channel_key TEXT NOT NULL, account_id TEXT NOT NULL, entry TEXT NOT NULL,
  sort_order INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  PRIMARY KEY (channel_key, account_id, entry)
) STRICT;
CREATE TABLE device_pairing_paired (
  device_id TEXT NOT NULL PRIMARY KEY, public_key TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL, approved_at_ms INTEGER NOT NULL
) STRICT;
`;

const AGENT_SCHEMA = `
CREATE TABLE auth_profile_store (
  store_key TEXT NOT NULL PRIMARY KEY, store_json TEXT NOT NULL, updated_at INTEGER NOT NULL
) STRICT;
CREATE TABLE auth_profile_state (
  state_key TEXT NOT NULL PRIMARY KEY, state_json TEXT NOT NULL, updated_at INTEGER NOT NULL
) STRICT;
CREATE TABLE session_nodes (
  session_key TEXT NOT NULL PRIMARY KEY, current_session_id TEXT NOT NULL,
  entry_json TEXT NOT NULL, updated_at INTEGER NOT NULL
) STRICT;
CREATE TABLE session_windows (
  session_id TEXT NOT NULL PRIMARY KEY, session_key TEXT NOT NULL, previous_session_id TEXT,
  reason TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
) STRICT;
CREATE TABLE transcript_events (
  session_id TEXT NOT NULL, seq INTEGER NOT NULL, event_json TEXT, created_at INTEGER NOT NULL,
  event_zstd BLOB, event_utf8_bytes INTEGER, navigation_json TEXT,
  PRIMARY KEY (session_id, seq)
) STRICT;
`;

export const DB_SESSION_EVENTS = {
  old: [JSON.stringify({ type: "session", version: 4, id: "s-db-old" })],
  current: [
    JSON.stringify({ type: "session", version: 4, id: "s-db-cur" }),
    JSON.stringify({ type: "message", id: "m1", message: { role: "user", content: "hello" } }),
  ],
};

/**
 * The database layout (OpenClaw 2026.5 onward): config in openclaw.json,
 * everything else in state/openclaw.sqlite and one openclaw-agent.sqlite per
 * agent. Returns a closer: the databases stay open (WAL uncheckpointed) until
 * it is called.
 */
export function writeDbLayout(dir: string): () => void {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  write(
    path.join(dir, "openclaw.json"),
    json({
      meta: { lastTouchedVersion: "2026.9.6", migrations: { modelPolicyAllowlist: true } },
      agents: {
        defaults: {
          model: { primary: "anthropic/claude-opus-5" },
          models: {
            "anthropic/claude-opus-5": { alias: "opus" },
            "openai/gpt-6": {},
          },
          modelPolicy: { allow: ["anthropic/claude-opus-5"] },
          embeddedAgent: { projectSettingsPolicy: "trusted", executionContract: "strict" },
        },
        entries: { main: { name: "Main" } },
      },
      memory: { search: { enabled: true } },
      tts: { auto: "off" },
      channels: {
        telegram: { botToken: SECRETS.telegramToken },
        discord: { token: { source: "store", id: "discord-token" } },
      },
      gateway: { mode: "local", auth: { mode: "token", token: SECRETS.gatewayToken } },
      plugins: {
        entries: {
          brave: { config: { webSearch: { apiKey: SECRETS.braveKey } } },
          anthropic: { enabled: true },
        },
      },
      browser: {
        profiles: {
          work: { driver: "openclaw", cdpPort: 18800 },
          attach: { driver: "existing-session" },
        },
      },
    }),
    0o600,
  );
  writeWorkspace(dir);

  const state = openDb(path.join(dir, "state", "openclaw.sqlite"));
  state.exec(STATE_SCHEMA);
  const machine = state.prepare(
    "INSERT INTO config_machine_state (state_key, value_json, updated_at_ms) VALUES (?, ?, 0)",
  );
  machine.run(
    "authProfiles.store",
    JSON.stringify({
      version: 1,
      profiles: {
        "anthropic:default": { type: "api_key", provider: "anthropic", key: SECRETS.anthropicKey },
      },
    }),
  );
  machine.run(
    "authProfiles.state",
    JSON.stringify({ version: 1, order: { anthropic: ["anthropic:default"] }, usageStats: {} }),
  );
  machine.run(
    "hooks.internal.installs",
    JSON.stringify({ "mail-hook": { source: "path", spec: "/opt/hooks/mail" } }),
  );
  machine.run(
    "plugins.installedIndex",
    JSON.stringify({ index: { installRecords: { groq: {}, voyage: {} } } }),
  );
  const job = state.prepare(
    "INSERT INTO cron_jobs (store_key, job_id, declaration_key, name, enabled, payload_kind, job_json, sort_order, updated_at) VALUES ('default', ?, ?, ?, 1, ?, ?, ?, 0)",
  );
  const base = {
    enabled: true,
    createdAtMs: 1_790_000_000_000,
    sessionTarget: "isolated",
    wakeMode: "now",
    state: {},
  };
  job.run(
    "job-brief",
    null,
    "morning brief",
    "agentTurn",
    JSON.stringify({
      ...base,
      id: "job-brief",
      name: "morning brief",
      schedule: { kind: "cron", expr: "0 7 * * *", tz: "America/Los_Angeles" },
      payload: { kind: "agentTurn", message: "Summarize my inbox", toolsAllow: ["*"] },
      delivery: { mode: "announce", channel: "telegram", to: "111" },
    }),
    0,
  );
  job.run(
    "job-heartbeat",
    "heartbeat:main",
    "heartbeat-main",
    "heartbeat",
    JSON.stringify({
      ...base,
      id: "job-heartbeat",
      declarationKey: "heartbeat:main",
      name: "heartbeat-main",
      schedule: { kind: "every", everyMs: 1_800_000 },
      payload: { kind: "heartbeat" },
    }),
    1,
  );
  const allow = state.prepare(
    "INSERT INTO channel_pairing_allow_entries (channel_key, account_id, entry, sort_order, updated_at) VALUES (?, ?, ?, ?, 0)",
  );
  allow.run("telegram", "default", "111", 0);
  allow.run("whatsapp", "work", "+15550002222", 0);
  state
    .prepare(
      "INSERT INTO device_pairing_paired (device_id, public_key, created_at_ms, approved_at_ms) VALUES ('phone', 'pk', 0, 0)",
    )
    .run();

  const agent = openDb(path.join(dir, "agents", "main", "agent", "openclaw-agent.sqlite"));
  agent.exec(AGENT_SCHEMA);
  agent
    .prepare(
      "INSERT INTO auth_profile_store (store_key, store_json, updated_at) VALUES ('primary', ?, 0)",
    )
    .run(
      JSON.stringify({
        version: 1,
        profiles: {
          "openai:default": { type: "api_key", provider: "openai", key: SECRETS.openaiKey },
        },
      }),
    );
  agent
    .prepare(
      "INSERT INTO session_nodes (session_key, current_session_id, entry_json, updated_at) VALUES (?, ?, ?, 0)",
    )
    .run(
      "agent:main:main",
      "s-db-cur",
      JSON.stringify({
        sessionId: "stale-id",
        updatedAt: 1_790_000_000_000,
        model: "claude-opus-5",
        createdVia: "run",
        skillsSnapshot: { prompt: "x" },
      }),
    );
  const windowRow = agent.prepare(
    "INSERT INTO session_windows (session_id, session_key, reason, created_at, updated_at) VALUES (?, 'agent:main:main', ?, 0, ?)",
  );
  windowRow.run("s-db-old", "initial", Date.UTC(2026, 8, 1, 12, 0, 0));
  windowRow.run("s-db-cur", "reset", Date.UTC(2026, 8, 2, 12, 0, 0));
  windowRow.run("../../escape", "fork", 0);
  const event = agent.prepare(
    "INSERT INTO transcript_events (session_id, seq, event_json, created_at, event_zstd, event_utf8_bytes, navigation_json) VALUES (?, ?, ?, 0, ?, ?, ?)",
  );
  event.run("s-db-old", 0, DB_SESSION_EVENTS.old[0] ?? "", null, null, null);
  event.run("s-db-cur", 0, DB_SESSION_EVENTS.current[0] ?? "", null, null, null);
  const compressed = Buffer.from(DB_SESSION_EVENTS.current[1] ?? "", "utf8");
  event.run(
    "s-db-cur",
    1,
    null,
    zlib.zstdCompressSync(compressed),
    compressed.byteLength,
    JSON.stringify({ version: 1 }),
  );
  event.run("../../escape", 0, JSON.stringify({ type: "session" }), null, null, null);

  return () => {
    agent.close();
    state.close();
  };
}
