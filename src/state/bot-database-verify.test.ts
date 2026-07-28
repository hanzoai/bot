import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { useAutoCleanupTempDirTracker } from "../../test/helpers/temp-dir.js";
import { requireNodeSqlite } from "../infra/node-sqlite.js";
import { readStableSqliteFileGeneration } from "../infra/sqlite-file-generation.js";
import { readSqliteNumberPragma } from "../infra/sqlite-pragma.test-support.js";
import {
  clearBotAgentDatabaseOpenFailure,
  closeBotAgentDatabaseByPath,
  closeBotAgentDatabasesForTest,
  openBotAgentDatabase,
  recordBotAgentDatabaseOpenFailure,
} from "./bot-agent-db.js";
import {
  applyBotDatabaseVerificationResults,
  runDatabaseVerifyWorker,
} from "./bot-database-verify.impl.js";
import {
  type BotDatabaseVerifyTarget,
  verifyBotDatabases,
} from "./bot-database-verify.worker.js";
import {
  clearBotDatabaseQuarantine,
  readBotDatabaseQuarantine,
  recordBotDatabaseQuarantine,
} from "./bot-quarantine-store.js";
import {
  closeBotStateDatabaseForTest,
  openBotStateDatabase,
  recordBotStateDatabaseOpenFailure,
  repairBotStateDatabaseSchema,
} from "./bot-state-db.js";

const tempDirs = useAutoCleanupTempDirTracker((cleanup) => {
  afterEach(() => {
    try {
      closeBotAgentDatabasesForTest();
    } finally {
      try {
        closeBotStateDatabaseForTest();
      } finally {
        cleanup();
      }
    }
  });
});

function createUnsafeIndexDrift(databasePath: string): void {
  const { DatabaseSync } = requireNodeSqlite();
  const database = new DatabaseSync(databasePath);
  try {
    database.exec(`
      CREATE TABLE unsafe_index_records (
        id INTEGER PRIMARY KEY,
        indexed_value TEXT NOT NULL,
        alternate_value TEXT NOT NULL
      );
      CREATE INDEX unsafe_index_records_value ON unsafe_index_records(indexed_value);
      INSERT INTO unsafe_index_records (indexed_value, alternate_value)
      VALUES ('alpha', 'zeta'), ('beta', 'eta'), ('gamma', 'theta');
    `);
    database.enableDefensive?.(false);
    database.exec("PRAGMA writable_schema = ON;");
    database
      .prepare(
        "UPDATE sqlite_schema SET sql = 'CREATE INDEX unsafe_index_records_value ON unsafe_index_records(alternate_value)' WHERE name = 'unsafe_index_records_value'",
      )
      .run();
    const schemaVersion = readSqliteNumberPragma(database, "schema_version");
    database.exec(`PRAGMA writable_schema = OFF; PRAGMA schema_version = ${schemaVersion + 1};`);
  } finally {
    database.close();
  }
}

function repairUnsafeIndexDrift(databasePath: string): void {
  const { DatabaseSync } = requireNodeSqlite();
  const database = new DatabaseSync(databasePath);
  try {
    database.enableDefensive?.(false);
    database.exec("PRAGMA writable_schema = ON;");
    database
      .prepare(
        "UPDATE sqlite_schema SET sql = 'CREATE INDEX unsafe_index_records_value ON unsafe_index_records(indexed_value)' WHERE name = 'unsafe_index_records_value'",
      )
      .run();
    const schemaVersion = readSqliteNumberPragma(database, "schema_version");
    database.exec(`PRAGMA writable_schema = OFF; PRAGMA schema_version = ${schemaVersion + 1};`);
  } finally {
    database.close();
  }
}

async function copyHealthyDatabase(sourcePath: string, targetPath: string): Promise<void> {
  const sqlite = requireNodeSqlite();
  const source = new sqlite.DatabaseSync(sourcePath, { readOnly: true });
  try {
    await sqlite.backup(source, targetPath);
  } finally {
    source.close();
  }
}

function quarantineStorePath(stateDir: string): string {
  return path.join(stateDir, "state", "bot-quarantine.sqlite");
}

function readLinuxPosixLocksForPath(pathname: string): string[] {
  if (process.platform !== "linux") {
    return [];
  }
  const inode = fs.statSync(pathname, { bigint: true }).ino;
  const lockInode = new RegExp(`\\b[0-9a-f]+:[0-9a-f]+:${inode}\\b`, "u");
  return fs
    .readFileSync("/proc/locks", "utf8")
    .split("\n")
    .filter((line) => line.includes(" POSIX ") && lockInode.test(line));
}

describe("Bot database integrity verifier", () => {
  it.skipIf(process.platform === "win32")(
    "preserves live WAL ownership while snapshotting an open database",
    async () => {
      const stateDir = tempDirs.make("bot-database-verify-live-locks-");
      const env = { BOT_STATE_DIR: stateDir };
      const agent = openBotAgentDatabase({ agentId: "worker-1", env });
      agent.db
        .prepare(
          "INSERT INTO auth_profile_state (state_key, state_json, updated_at) VALUES (?, ?, ?)",
        )
        .run("verifier-lock-owner", JSON.stringify({ preserved: true }), 1);
      const walBefore = fs.statSync(`${agent.path}-wal`);
      const shmBefore = fs.statSync(`${agent.path}-shm`);
      const baseLocksBefore = readLinuxPosixLocksForPath(agent.path);
      if (process.platform === "linux") {
        expect(baseLocksBefore.length).toBeGreaterThan(0);
      }
      const targets: BotDatabaseVerifyTarget[] = [
        { kind: "agent", label: "Bot agent database worker-1", path: agent.path },
      ];

      await expect(runDatabaseVerifyWorker(targets)).resolves.toEqual([
        { path: agent.path, ok: true },
      ]);
      if (process.platform === "linux") {
        // SQLite 3.51 can preserve visible WAL files after a lock is lost, so
        // assert the kernel lock itself rather than relying on that symptom.
        expect(readLinuxPosixLocksForPath(agent.path).length).toBeGreaterThan(0);
      }
      const reader = spawnSync(
        process.execPath,
        [
          "--input-type=module",
          "-e",
          `
            import { DatabaseSync } from "node:sqlite";
            const database = new DatabaseSync(process.env.BOT_VERIFY_TEST_PATH);
            database.prepare("PRAGMA schema_version;").get();
            database.close();
          `,
        ],
        {
          env: { ...process.env, BOT_VERIFY_TEST_PATH: agent.path },
          encoding: "utf8",
        },
      );

      expect(reader.stderr).toBe("");
      expect(reader.status).toBe(0);
      expect(fs.statSync(`${agent.path}-wal`).ino).toBe(walBefore.ino);
      expect(fs.statSync(`${agent.path}-shm`).ino).toBe(shmBefore.ino);
      expect(() =>
        agent.db
          .prepare("UPDATE auth_profile_state SET updated_at = ? WHERE state_key = ?")
          .run(2, "verifier-lock-owner"),
      ).not.toThrow();
    },
  );

  it("detects corruption off-thread, quarantines it, and latches later opens", async () => {
    const stateDir = tempDirs.make("bot-database-verify-");
    const env = { BOT_STATE_DIR: stateDir };
    const agentPath = openBotAgentDatabase({ agentId: "worker-1", env }).path;
    createUnsafeIndexDrift(agentPath);
    const targets: BotDatabaseVerifyTarget[] = [
      { kind: "agent", label: "Bot agent database worker-1", path: agentPath },
    ];

    const directResults = await verifyBotDatabases(targets);
    expect(directResults).toEqual([
      {
        path: agentPath,
        ok: false,
        error: expect.stringMatching(/missing from index unsafe_index_records_value/iu),
        terminal: true,
      },
    ]);
    await expect(runDatabaseVerifyWorker(targets)).resolves.toEqual(directResults);

    applyBotDatabaseVerificationResults({
      env,
      results: directResults,
      targets,
    });
    const quarantine = readBotDatabaseQuarantine(agentPath, { env });
    expect(quarantine).toEqual({
      kind: "agent",
      quarantinedAt: expect.any(Number),
      reason: expect.stringMatching(/missing from index unsafe_index_records_value/iu),
    });

    expect(() => openBotAgentDatabase({ agentId: "worker-1", env })).toThrow(
      expect.objectContaining({ name: "SqliteIntegrityError" }),
    );

    closeBotAgentDatabasesForTest();
    closeBotStateDatabaseForTest();
    expect(() => openBotAgentDatabase({ agentId: "worker-1", env })).toThrow(
      expect.objectContaining({
        name: "SqliteIntegrityError",
        message: expect.stringContaining(quarantine?.reason ?? ""),
      }),
    );
    clearBotAgentDatabaseOpenFailure(agentPath, { env });
    expect(() => openBotAgentDatabase({ agentId: "worker-1", env })).toThrow(
      expect.objectContaining({ name: "SqliteIntegrityError" }),
    );
  });

  it("does not quarantine a healthy database that replaced the verified file", async () => {
    const stateDir = tempDirs.make("bot-database-verify-replacement-");
    const env = { BOT_STATE_DIR: stateDir };
    const agentPath = openBotAgentDatabase({ agentId: "worker-1", env }).path;
    closeBotAgentDatabasesForTest();
    closeBotStateDatabaseForTest();

    const healthyReplacementPath = `${agentPath}.healthy`;
    const corruptArchivePath = `${agentPath}.corrupt`;
    fs.copyFileSync(agentPath, healthyReplacementPath);
    createUnsafeIndexDrift(agentPath);
    const targets: BotDatabaseVerifyTarget[] = [
      { kind: "agent", label: "Bot agent database worker-1", path: agentPath },
    ];
    const results = await verifyBotDatabases(targets);
    expect(results).toEqual([
      expect.objectContaining({
        path: agentPath,
        ok: false,
        terminal: true,
      }),
    ]);

    fs.renameSync(agentPath, corruptArchivePath);
    fs.renameSync(healthyReplacementPath, agentPath);
    applyBotDatabaseVerificationResults({ env, results, targets });

    expect(readBotDatabaseQuarantine(agentPath, { env })).toBeUndefined();
    expect(openBotAgentDatabase({ agentId: "worker-1", env }).db.isOpen).toBe(true);
  });

  it.skipIf(process.platform === "win32")(
    "does not quarantine a healthy replacement while the corrupt agent inode is cached",
    async () => {
      const stateDir = tempDirs.make("bot-database-verify-live-agent-replace-");
      const env = { BOT_STATE_DIR: stateDir };
      const agent = openBotAgentDatabase({ agentId: "worker-1", env });
      const healthyReplacementPath = `${agent.path}.healthy`;
      const corruptArchivePath = `${agent.path}.corrupt`;
      await copyHealthyDatabase(agent.path, healthyReplacementPath);
      createUnsafeIndexDrift(agent.path);
      const targets: BotDatabaseVerifyTarget[] = [
        { kind: "agent", label: "Bot agent database worker-1", path: agent.path },
      ];
      const results = await verifyBotDatabases(targets);

      fs.renameSync(agent.path, corruptArchivePath);
      fs.renameSync(healthyReplacementPath, agent.path);
      applyBotDatabaseVerificationResults({ env, results, targets });

      expect(agent.db.isOpen).toBe(false);
      expect(readBotDatabaseQuarantine(agent.path, { env })).toBeUndefined();
      expect(openBotAgentDatabase({ agentId: "worker-1", env }).db.isOpen).toBe(true);
    },
  );

  it.skipIf(process.platform === "win32")(
    "does not quarantine a healthy replacement while the corrupt state inode is cached",
    async () => {
      const stateDir = tempDirs.make("bot-database-verify-live-state-replace-");
      const env = { BOT_STATE_DIR: stateDir };
      const state = openBotStateDatabase({ env });
      const healthyReplacementPath = `${state.path}.healthy`;
      const corruptArchivePath = `${state.path}.corrupt`;
      await copyHealthyDatabase(state.path, healthyReplacementPath);
      createUnsafeIndexDrift(state.path);
      const targets: BotDatabaseVerifyTarget[] = [
        { kind: "state", label: "Bot state database", path: state.path },
      ];
      const results = await verifyBotDatabases(targets);

      fs.renameSync(state.path, corruptArchivePath);
      fs.renameSync(healthyReplacementPath, state.path);
      applyBotDatabaseVerificationResults({ env, results, targets });

      expect(state.db.isOpen).toBe(false);
      expect(readBotDatabaseQuarantine(state.path, { env })).toBeUndefined();
      expect(openBotStateDatabase({ env }).db.isOpen).toBe(true);
    },
  );

  it("reconfirms and quarantines a corrupt closed database", async () => {
    const stateDir = tempDirs.make("bot-database-verify-closed-");
    const env = { BOT_STATE_DIR: stateDir };
    const agentPath = openBotAgentDatabase({ agentId: "worker-1", env }).path;
    closeBotAgentDatabasesForTest();
    closeBotStateDatabaseForTest();
    createUnsafeIndexDrift(agentPath);
    const targets: BotDatabaseVerifyTarget[] = [
      { kind: "agent", label: "Bot agent database worker-1", path: agentPath },
    ];
    const results = await verifyBotDatabases(targets);

    applyBotDatabaseVerificationResults({ env, results, targets });

    expect(readBotDatabaseQuarantine(agentPath, { env })?.reason).toMatch(
      /missing from index unsafe_index_records_value/iu,
    );
    expect(() => openBotAgentDatabase({ agentId: "worker-1", env })).toThrow(
      expect.objectContaining({ name: "SqliteIntegrityError" }),
    );
  });

  it("does not quarantine a repaired database after same-inode mutation", async () => {
    const stateDir = tempDirs.make("bot-database-verify-repair-race-");
    const env = { BOT_STATE_DIR: stateDir };
    const agentPath = openBotAgentDatabase({ agentId: "worker-1", env }).path;
    closeBotAgentDatabasesForTest();
    closeBotStateDatabaseForTest();
    createUnsafeIndexDrift(agentPath);
    const targets: BotDatabaseVerifyTarget[] = [
      { kind: "agent", label: "Bot agent database worker-1", path: agentPath },
    ];
    const results = await verifyBotDatabases(targets);
    expect(results[0]).toEqual(expect.objectContaining({ ok: false, terminal: true }));

    repairUnsafeIndexDrift(agentPath);
    await expect(verifyBotDatabases(targets)).resolves.toEqual([
      expect.objectContaining({ ok: true }),
    ]);
    applyBotDatabaseVerificationResults({ env, results, targets });

    expect(readBotDatabaseQuarantine(agentPath, { env })).toBeUndefined();
    expect(openBotAgentDatabase({ agentId: "worker-1", env }).db.isOpen).toBe(true);
  });

  it("rejects stale terminal results after draining healthy owners", () => {
    const stateDir = tempDirs.make("bot-database-verify-live-stale-");
    const env = { BOT_STATE_DIR: stateDir };
    const state = openBotStateDatabase({ env });
    const agent = openBotAgentDatabase({ agentId: "worker-1", env });
    const targets: BotDatabaseVerifyTarget[] = [
      { kind: "state", label: "Bot state database", path: state.path },
      { kind: "agent", label: "Bot agent database worker-1", path: agent.path },
    ];

    applyBotDatabaseVerificationResults({
      env,
      results: targets.map((target) => ({
        path: target.path,
        ok: false,
        error: "stale terminal result",
        terminal: true,
      })),
      targets,
    });

    expect(readBotDatabaseQuarantine(state.path, { env })).toBeUndefined();
    expect(readBotDatabaseQuarantine(agent.path, { env })).toBeUndefined();
    expect(state.db.isOpen).toBe(false);
    expect(agent.db.isOpen).toBe(false);
    expect(openBotStateDatabase({ env }).db.isOpen).toBe(true);
    expect(openBotAgentDatabase({ agentId: "worker-1", env }).db.isOpen).toBe(true);
  });

  it("revalidates agent schema ownership after confirmation drains a pathname", () => {
    const stateDir = tempDirs.make("bot-database-verify-agent-revalidate-");
    const env = { BOT_STATE_DIR: stateDir };
    const agent = openBotAgentDatabase({ agentId: "worker-1", env });
    const replacementPath = `${agent.path}.replacement`;
    const { DatabaseSync } = requireNodeSqlite();
    const replacement = new DatabaseSync(replacementPath);
    replacement.close();
    expect(closeBotAgentDatabaseByPath(agent.path)).toBe(true);
    fs.rmSync(agent.path);
    fs.renameSync(replacementPath, agent.path);
    const targets: BotDatabaseVerifyTarget[] = [
      { kind: "agent", label: "Bot agent database worker-1", path: agent.path },
    ];

    applyBotDatabaseVerificationResults({
      env,
      results: [{ path: agent.path, ok: false, error: "stale terminal result", terminal: true }],
      targets,
    });

    const reopened = openBotAgentDatabase({ agentId: "worker-1", env });
    expect(
      reopened.db
        .prepare("SELECT role, agent_id FROM schema_meta WHERE meta_key = 'primary'")
        .get(),
    ).toEqual({ role: "agent", agent_id: "worker-1" });
  });

  it("expires a generation-bound process latch after the database changes", () => {
    const stateDir = tempDirs.make("bot-database-verify-latch-generation-");
    const env = { BOT_STATE_DIR: stateDir };
    const agentPath = openBotAgentDatabase({ agentId: "worker-1", env }).path;
    closeBotAgentDatabasesForTest();
    const generation = readStableSqliteFileGeneration(agentPath);
    const error = new Error("verified corrupt generation");
    error.name = "SqliteIntegrityError";

    expect(recordBotAgentDatabaseOpenFailure(agentPath, error, generation)).toBe(true);
    const { DatabaseSync } = requireNodeSqlite();
    const changed = new DatabaseSync(agentPath);
    try {
      changed.exec("CREATE TABLE generation_change (id INTEGER PRIMARY KEY) STRICT;");
    } finally {
      changed.close();
    }

    expect(openBotAgentDatabase({ agentId: "worker-1", env }).db.isOpen).toBe(true);
  });

  it("reports an uncleared quarantine row instead of claiming repair success", () => {
    const stateDir = tempDirs.make("bot-database-verify-clear-failure-");
    const env = { BOT_STATE_DIR: stateDir };
    const agentPath = openBotAgentDatabase({ agentId: "worker-1", env }).path;
    openBotStateDatabase({ env });
    closeBotAgentDatabasesForTest();
    closeBotStateDatabaseForTest();
    expect(
      recordBotDatabaseQuarantine({
        env,
        kind: "agent",
        path: agentPath,
        reason: "corrupt index",
      }),
    ).toBe(true);
    const error = new Error("corrupt index");
    error.name = "SqliteIntegrityError";
    recordBotAgentDatabaseOpenFailure(agentPath, error);
    closeBotStateDatabaseForTest();

    const storePath = quarantineStorePath(stateDir);
    // A read-only quarantine store cannot drop the row; the clear must say so
    // instead of letting doctor report success while the next open still refuses.
    fs.chmodSync(storePath, 0o444);
    try {
      expect(clearBotAgentDatabaseOpenFailure(agentPath, { env })).toBe(false);
      expect(
        recordBotDatabaseQuarantine({
          env,
          kind: "agent",
          path: agentPath,
          reason: "new reason",
        }),
      ).toBe(false);
    } finally {
      fs.chmodSync(storePath, 0o600);
    }
    expect(clearBotAgentDatabaseOpenFailure(agentPath, { env })).toBe(true);
    expect(openBotAgentDatabase({ agentId: "worker-1", env }).db.isOpen).toBe(true);
  });

  it("keeps healthy opens on the missing-store fast path", () => {
    const stateDir = tempDirs.make("bot-database-verify-clean-");
    const env = { BOT_STATE_DIR: stateDir };

    openBotStateDatabase({ env });
    openBotAgentDatabase({ agentId: "worker-1", env });

    expect(fs.existsSync(quarantineStorePath(stateDir))).toBe(false);
  });

  it("records and clears dedicated quarantine rows with rollback journaling", () => {
    const stateDir = tempDirs.make("bot-database-verify-store-");
    const env = { BOT_STATE_DIR: stateDir };
    const databasePath = path.join(stateDir, "agent.sqlite");
    const storePath = quarantineStorePath(stateDir);

    expect(clearBotDatabaseQuarantine(databasePath, { env })).toBe(true);
    expect(
      recordBotDatabaseQuarantine({
        env,
        kind: "agent",
        path: databasePath,
        reason: "corrupt index",
      }),
    ).toBe(true);
    expect(readBotDatabaseQuarantine(databasePath, { env })).toEqual({
      kind: "agent",
      quarantinedAt: expect.any(Number),
      reason: "corrupt index",
    });

    const { DatabaseSync } = requireNodeSqlite();
    const raw = new DatabaseSync(storePath, { readOnly: true });
    try {
      expect(raw.prepare("PRAGMA journal_mode").get()).toEqual({ journal_mode: "delete" });
      expect(readSqliteNumberPragma(raw, "synchronous")).toBe(2);
      expect(readSqliteNumberPragma(raw, "user_version")).toBe(2);
    } finally {
      raw.close();
    }
    if (process.platform !== "win32") {
      expect(fs.statSync(path.dirname(storePath)).mode & 0o777).toBe(0o700);
      expect(fs.statSync(storePath).mode & 0o777).toBe(0o600);
    }
    expect(clearBotDatabaseQuarantine(databasePath, { env })).toBe(true);
    expect(clearBotDatabaseQuarantine(databasePath, { env })).toBe(true);
    expect(readBotDatabaseQuarantine(databasePath, { env })).toBeUndefined();
  });

  it("expires a persisted quarantine when the verified database generation changes", () => {
    const stateDir = tempDirs.make("bot-database-verify-store-generation-");
    const env = { BOT_STATE_DIR: stateDir };
    const databasePath = path.join(stateDir, "agent.sqlite");
    const { DatabaseSync } = requireNodeSqlite();
    const database = new DatabaseSync(databasePath);
    try {
      database.exec("CREATE TABLE records (id INTEGER PRIMARY KEY) STRICT;");
    } finally {
      database.close();
    }
    const generation = readStableSqliteFileGeneration(databasePath);

    expect(
      recordBotDatabaseQuarantine({
        env,
        generation,
        kind: "agent",
        path: databasePath,
        reason: "corrupt generation",
      }),
    ).toBe(true);
    expect(readBotDatabaseQuarantine(databasePath, { env })?.reason).toBe(
      "corrupt generation",
    );

    const changed = new DatabaseSync(databasePath);
    try {
      changed.exec("INSERT INTO records DEFAULT VALUES;");
    } finally {
      changed.close();
    }
    expect(readBotDatabaseQuarantine(databasePath, { env })).toBeUndefined();
  });

  it("reads schema-v1 quarantine rows and migrates them on the next write", () => {
    const stateDir = tempDirs.make("bot-database-verify-store-v1-");
    const env = { BOT_STATE_DIR: stateDir };
    const databasePath = path.join(stateDir, "agent.sqlite");
    const storePath = quarantineStorePath(stateDir);
    fs.mkdirSync(path.dirname(storePath), { recursive: true });
    const { DatabaseSync } = requireNodeSqlite();
    const legacy = new DatabaseSync(storePath);
    try {
      legacy.exec(`
        CREATE TABLE quarantined_databases (
          path TEXT NOT NULL PRIMARY KEY,
          kind TEXT NOT NULL,
          reason TEXT NOT NULL,
          quarantined_at INTEGER NOT NULL,
          writer_app_version TEXT
        ) STRICT;
        PRAGMA user_version = 1;
      `);
      legacy
        .prepare(
          "INSERT INTO quarantined_databases (path, kind, reason, quarantined_at) VALUES (?, ?, ?, ?)",
        )
        .run(path.resolve(databasePath), "agent", "legacy quarantine", 1);
    } finally {
      legacy.close();
    }

    expect(readBotDatabaseQuarantine(databasePath, { env })).toEqual({
      kind: "agent",
      quarantinedAt: 1,
      reason: "legacy quarantine",
    });
    expect(
      recordBotDatabaseQuarantine({
        env,
        kind: "agent",
        path: databasePath,
        reason: "migrated quarantine",
      }),
    ).toBe(true);

    const migrated = new DatabaseSync(storePath, { readOnly: true });
    try {
      expect(readSqliteNumberPragma(migrated, "user_version")).toBe(2);
      expect(
        migrated
          .prepare("SELECT reason, verified_generation FROM quarantined_databases WHERE path = ?")
          .get(path.resolve(databasePath)),
      ).toEqual({ reason: "migrated quarantine", verified_generation: null });
    } finally {
      migrated.close();
    }
  });

  it("recovers an interrupted empty quarantine-store initialization", () => {
    const stateDir = tempDirs.make("bot-database-verify-empty-store-");
    const env = { BOT_STATE_DIR: stateDir };
    const databasePath = path.join(stateDir, "agent.sqlite");
    const storePath = quarantineStorePath(stateDir);
    fs.mkdirSync(path.dirname(storePath), { recursive: true });
    fs.writeFileSync(storePath, "", { mode: 0o600 });

    expect(readBotDatabaseQuarantine(databasePath, { env })).toBeUndefined();
    expect(
      recordBotDatabaseQuarantine({
        env,
        kind: "agent",
        path: databasePath,
        reason: "corrupt index",
      }),
    ).toBe(true);
    expect(readBotDatabaseQuarantine(databasePath, { env })?.reason).toBe("corrupt index");
  });

  it.skipIf(process.platform === "win32")(
    "recovers a hot rollback journal before reading quarantine",
    () => {
      const stateDir = tempDirs.make("bot-database-verify-hot-journal-");
      const env = { BOT_STATE_DIR: stateDir };
      const databasePath = path.join(stateDir, "agent.sqlite");
      const storePath = quarantineStorePath(stateDir);
      expect(
        recordBotDatabaseQuarantine({
          env,
          kind: "agent",
          path: databasePath,
          reason: "committed reason",
        }),
      ).toBe(true);

      const crashed = spawnSync(
        process.execPath,
        [
          "--no-warnings",
          "--input-type=module",
          "-e",
          `
            import { DatabaseSync } from "node:sqlite";
            const database = new DatabaseSync(process.env.BOT_QUARANTINE_TEST_PATH);
            database.exec("PRAGMA journal_mode = DELETE; PRAGMA synchronous = FULL; BEGIN IMMEDIATE;");
            database.prepare("UPDATE quarantined_databases SET reason = 'uncommitted reason'").run();
            process.kill(process.pid, "SIGKILL");
          `,
        ],
        { env: { ...process.env, BOT_QUARANTINE_TEST_PATH: storePath } },
      );
      expect(crashed.signal).toBe("SIGKILL");
      expect(fs.existsSync(`${storePath}-journal`)).toBe(true);

      expect(readBotDatabaseQuarantine(databasePath, { env })?.reason).toBe(
        "committed reason",
      );
    },
  );

  it("does not latch transient verifier errors", () => {
    const stateDir = tempDirs.make("bot-database-verify-transient-");
    const env = { BOT_STATE_DIR: stateDir };
    const agentPath = openBotAgentDatabase({ agentId: "worker-1", env }).path;
    closeBotAgentDatabasesForTest();
    closeBotStateDatabaseForTest();
    const targets: BotDatabaseVerifyTarget[] = [
      { kind: "agent", label: "Bot agent database worker-1", path: agentPath },
    ];

    applyBotDatabaseVerificationResults({
      env,
      results: [{ path: agentPath, ok: false, error: "Error: database is busy", terminal: false }],
      targets,
    });

    expect(openBotAgentDatabase({ agentId: "worker-1", env }).db.isOpen).toBe(true);
  });

  it("persists state failure quarantine across restart until doctor repair", () => {
    const stateDir = tempDirs.make("bot-database-verify-state-failure-");
    const env = { BOT_STATE_DIR: stateDir };
    const statePath = openBotStateDatabase({ env }).path;
    closeBotStateDatabaseForTest();

    expect(
      recordBotDatabaseQuarantine({
        env,
        kind: "state",
        path: statePath,
        reason: "corrupt index",
      }),
    ).toBe(true);
    const error = new Error("corrupt index");
    error.name = "SqliteIntegrityError";
    recordBotStateDatabaseOpenFailure(statePath, error);

    const { DatabaseSync } = requireNodeSqlite();
    const raw = new DatabaseSync(quarantineStorePath(stateDir), { readOnly: true });
    try {
      expect(
        raw.prepare("SELECT kind, reason FROM quarantined_databases WHERE path = ?").get(statePath),
      ).toEqual({ kind: "state", reason: "corrupt index" });
    } finally {
      raw.close();
    }
    expect(() => openBotStateDatabase({ env })).toThrow(
      expect.objectContaining({
        name: "SqliteIntegrityError",
        message: expect.stringContaining("corrupt index"),
      }),
    );
    closeBotStateDatabaseForTest();
    expect(() => openBotStateDatabase({ env })).toThrow(
      expect.objectContaining({
        name: "SqliteIntegrityError",
        message: expect.stringContaining("corrupt index"),
      }),
    );
    expect(repairBotStateDatabaseSchema({ env }).warnings).toEqual([]);
    expect(openBotStateDatabase({ env }).db.isOpen).toBe(true);
  });
});
