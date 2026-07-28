// Bot state database manages shared persisted state and migrations.
import { existsSync } from "node:fs";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import {
  clearNodeSqliteKyselyCacheForDatabase,
  executeSqliteQuerySync,
  getNodeSqliteKysely,
} from "../infra/kysely-sync.js";
import { openNodeSqliteDatabase } from "../infra/node-sqlite.js";
import type { SqliteFileGeneration } from "../infra/sqlite-file-generation.js";
import { repairCanonicalSqliteIndexes } from "../infra/sqlite-index-schema.js";
import {
  assertSqliteIntegrity,
  confirmSqliteFileIntegrity,
  isTerminalSqliteIntegrityError,
  type SqliteIntegrityConfirmation,
} from "../infra/sqlite-integrity.js";
import { prepareSqliteReadOnlyLocation } from "../infra/sqlite-readonly-location.js";
import { assertSqliteSchemaTablesPresent } from "../infra/sqlite-schema-contract.js";
import { migrateSqliteSchemaToStrictInTransaction } from "../infra/sqlite-strict.js";
import { createSqliteTerminalOpenLatch } from "../infra/sqlite-terminal-open-latch.js";
import {
  runSqliteImmediateTransactionSync,
  type SqliteTransactionOptions,
} from "../infra/sqlite-transaction.js";
import { readSqliteUserVersion } from "../infra/sqlite-user-version.js";
import {
  configureSqliteConnectionPragmas,
  configureSqlitePreSchemaPragmas,
  type SqliteWalMaintenance,
} from "../infra/sqlite-wal.js";
import { migrateLegacyCronRunLogsToTaskRuns } from "../infra/state-migrations.cron-run-logs.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { VERSION } from "../version.js";
import {
  clearBotDatabaseQuarantine,
  readBotDatabaseQuarantine,
} from "./bot-quarantine-store.js";
import { repairAuditEventsSchema } from "./bot-state-db-audit-migration.js";
import {
  BOT_DATABASE_SCHEMA_DOCS_URL,
  LAZY_ADDITIVE_STATE_TABLES,
  BOT_SQLITE_BUSY_TIMEOUT_MS,
  BOT_STATE_SCHEMA_VERSION,
  BOT_STATE_STRICT_SCHEMA_VERSION,
  type BotStateDatabase,
  type BotStateDatabaseOptions,
} from "./bot-state-db-contract.js";
import {
  assertBotStateDatabaseForMaintenance,
  assertBotStateDatabaseV5ForMigration,
  assertSupportedSchemaVersion,
  createBotDatabaseVerificationError,
  resolveDatabasePath,
} from "./bot-state-db-maintenance.js";
import * as operatorApprovalMigration from "./bot-state-db-operator-approval-migration.js";
import { ensureBotStatePermissions } from "./bot-state-db-permissions.js";
import { ensureAdditiveStateColumns } from "./bot-state-db-schema-additive.js";
import { tableExists } from "./bot-state-db-schema-helpers.js";
import {
  assertCanonicalStateSchemaShape,
  dropLegacyStateTables,
  markCurrentStateSchemaVersion,
  repairAgentDatabasesCompositePrimaryKey,
  repairLegacyGatewayRestartHandoffsForStrictMigration,
} from "./bot-state-db-schema-repair.js";
import * as sessionWatchMigration from "./bot-state-db-session-watch-migration.js";
import type { DB as BotStateKyselyDatabase } from "./bot-state-db.generated.js";
import { BOT_STATE_SCHEMA_SQL } from "./bot-state-schema.generated.js";

export {
  BOT_DATABASE_SCHEMA_DOCS_URL,
  BOT_SQLITE_BUSY_TIMEOUT_MS,
  BOT_STATE_SCHEMA_VERSION,
};
export type {
  BotStateDatabase,
  BotStateDatabaseOptions,
  BotStateDatabaseSchemaMigration,
} from "./bot-state-db-contract.js";
export {
  assertBotStateDatabaseForMaintenance,
  createBotDatabaseVerificationError,
} from "./bot-state-db-maintenance.js";
export { ensureBotStatePermissions } from "./bot-state-db-permissions.js";
export { detectBotStateDatabaseSchemaMigrations } from "./bot-state-db-schema-repair.js";
export { withBotStateStartupMigrationCheckpointDatabase } from "./bot-state-db-startup-checkpoint.js";

/**
 * Shared Bot SQLite state database lifecycle and metadata writers.
 *
 * This module owns schema creation, additive migrations for released state
 * tables, private file permissions, cached handles, and audit rows for
 * migrations/backups that operate on local state.
 */
const cachedDatabases = new Map<string, BotStateDatabase>();
const terminalOpenLatch = createSqliteTerminalOpenLatch({
  closeByPath: (pathname) => {
    const cached = cachedDatabases.get(pathname);
    if (!cached) {
      return;
    }
    cached.walMaintenance.close();
    clearNodeSqliteKyselyCacheForDatabase(cached.db);
    if (cached.db.isOpen) {
      cached.db.close();
    }
    cachedDatabases.delete(pathname);
  },
});

/** Reconfirm an advisory worker failure on the live owner connection. */
export function confirmBotStateDatabaseIntegrity(
  pathname: string,
): SqliteIntegrityConfirmation {
  const resolvedPath = path.resolve(pathname);
  closeBotStateDatabaseByPath(resolvedPath);
  return confirmSqliteFileIntegrity(resolvedPath, resolvedPath);
}

/** Latch background verification damage so later opens fail without rescanning. */
export function recordBotStateDatabaseOpenFailure(
  pathname: string,
  error: Error,
  generation?: SqliteFileGeneration,
): boolean {
  return terminalOpenLatch.record(pathname, error, generation);
}

/** Clear a terminal open failure after doctor rewrites the database file. */
export function clearBotStateDatabaseOpenFailure(pathname: string): void {
  terminalOpenLatch.clear(pathname);
}

type BotStateMetadataDatabase = Pick<BotStateKyselyDatabase, "schema_meta">;
const stateDbLog = createSubsystemLogger("state/db");

function executeCanonicalStateSchema(
  database: DatabaseSync,
  options: { includeLazyAdditiveTables: boolean },
): void {
  if (options.includeLazyAdditiveTables) {
    database.exec(BOT_STATE_SCHEMA_SQL);
    return;
  }

  // Current-version databases may lack lazy cache tables, but the remaining
  // canonical DDL must still run so doctor can restore indexes and triggers.
  let eagerSchema = BOT_STATE_SCHEMA_SQL;
  for (const tableName of LAZY_ADDITIVE_STATE_TABLES) {
    const startMarker = `CREATE TABLE IF NOT EXISTS ${tableName} (`;
    const start = eagerSchema.indexOf(startMarker);
    const endMarker = "\n) STRICT;";
    const end = start >= 0 ? eagerSchema.indexOf(endMarker, start) : -1;
    if (start < 0 || end < 0) {
      throw new Error(`lazy additive state schema block is missing for ${tableName}`);
    }
    eagerSchema = `${eagerSchema.slice(0, start)}${eagerSchema.slice(end + endMarker.length)}`;
  }
  database.exec(eagerSchema);
}

export function repairBotStateDatabaseSchema(options: BotStateDatabaseOptions = {}): {
  changes: string[];
  warnings: string[];
} {
  const env = options.env ?? process.env;
  const pathname = resolveDatabasePath(options);
  if (!existsSync(pathname)) {
    return { changes: [], warnings: [] };
  }
  ensureBotStatePermissions(pathname, env);
  const db = openNodeSqliteDatabase(pathname);
  const rebuiltIndexNames = new Set<string>();
  try {
    assertSupportedSchemaVersion(db, pathname);
    db.exec("PRAGMA foreign_keys = OFF;");
    const changes = runSqliteImmediateTransactionSync(
      db,
      () => {
        const applied: string[] = [];
        const previousVersion = readSqliteUserVersion(db);
        if (previousVersion === BOT_STATE_SCHEMA_VERSION) {
          for (const name of repairCanonicalSqliteIndexes(db, pathname, BOT_STATE_SCHEMA_SQL, {
            allowMissingColumns: true,
          })) {
            rebuiltIndexNames.add(name);
          }
          // Current-schema doctor repair may normalize recognized columns or
          // table options, but it must never recreate a missing table empty.
          assertSqliteSchemaTablesPresent(db, pathname, BOT_STATE_SCHEMA_SQL, {
            allowedMissingTables: LAZY_ADDITIVE_STATE_TABLES,
          });
        }
        if (rebuiltIndexNames.size === 0) {
          assertSqliteIntegrity(db, pathname);
        }
        dropLegacyStateTables(db);
        if (repairAgentDatabasesCompositePrimaryKey(db)) {
          applied.push(`Migrated shared state agent database registry primary key → agent_id,path`);
        }
        if (repairAuditEventsSchema(db)) {
          applied.push(
            `Migrated shared state audit event ledger → versioned message lifecycle schema`,
          );
        }
        applied.push(...operatorApprovalMigration.repairOperatorApprovalSchema(db));
        const needsSessionWatchMigration =
          sessionWatchMigration.needsSessionWatchCursorProvenanceMigration(db, previousVersion);
        const sessionWatchResult = sessionWatchMigration.migrateSessionWatchCursorProvenance(db);
        if (needsSessionWatchMigration) {
          applied.push(
            `Migrated shared state session watch cursors → provenance column (${sessionWatchResult.migratedAmbientWatches} ambient, ${sessionWatchResult.removedLegacySentinels} sentinels removed)`,
          );
        }
        assertCanonicalStateSchemaShape(db, pathname);
        if (tableExists(db, "audit_events")) {
          ensureAdditiveStateColumns(db);
          executeCanonicalStateSchema(db, {
            includeLazyAdditiveTables: previousVersion !== BOT_STATE_SCHEMA_VERSION,
          });
          if (previousVersion < BOT_STATE_STRICT_SCHEMA_VERSION) {
            repairLegacyGatewayRestartHandoffsForStrictMigration(db);
          }
          const strictMigration = migrateSqliteSchemaToStrictInTransaction(
            db,
            BOT_STATE_SCHEMA_SQL,
            { databaseLabel: pathname },
          );
          if (strictMigration.migratedTables.length > 0) {
            applied.push(
              `Migrated shared state tables to SQLite STRICT typing (${strictMigration.migratedTables.length})`,
            );
          }
          for (const name of repairCanonicalSqliteIndexes(db, pathname, BOT_STATE_SCHEMA_SQL, {
            verifyPhysicalIntegrity: false,
          })) {
            rebuiltIndexNames.add(name);
          }
        }
        markCurrentStateSchemaVersion(db, {
          createMetadataIfMissing: previousVersion < BOT_STATE_SCHEMA_VERSION,
        });
        if (readSqliteUserVersion(db) === BOT_STATE_SCHEMA_VERSION) {
          assertCurrentStateRuntimeSchema(db, pathname);
        }
        if (rebuiltIndexNames.size > 0) {
          applied.push(`Rebuilt canonical shared-state SQLite indexes (${rebuiltIndexNames.size})`);
        }
        return applied;
      },
      {
        busyTimeoutMs: BOT_SQLITE_BUSY_TIMEOUT_MS,
        databaseLabel: pathname,
        operationLabel: "state.schema.repair",
      },
    );
    const quarantineCleared = clearBotDatabaseQuarantine(pathname, { env });
    clearBotStateDatabaseOpenFailure(pathname);
    return {
      changes,
      warnings: quarantineCleared
        ? []
        : [
            `Persisted quarantine record for ${pathname} could not be cleared; rerun bot doctor --fix so the repaired database is not refused again.`,
          ],
    };
  } catch (err) {
    // Reaching this catch inside doctor means repair itself refused or failed,
    // so the runtime asserts' "run bot doctor --fix" advice is circular here.
    const reason = String(err).replace(
      /has a legacy ([a-z ]+) schema; run bot doctor --fix to migrate it\./u,
      "has a legacy $1 schema; automatic repair refused the unrecognized schema shape.",
    );
    return {
      changes: [],
      warnings: [`Failed migrating shared state database schema at ${pathname}: ${reason}`],
    };
  } finally {
    if (db.isOpen) {
      db.exec("PRAGMA foreign_keys = ON;");
    }
    db.close();
    ensureBotStatePermissions(pathname, env);
  }
}

function ensureSchema(db: DatabaseSync, pathname: string): void {
  const now = Date.now();
  const kysely = getNodeSqliteKysely<BotStateMetadataDatabase>(db);
  // Rebuilding referenced tables requires disabling FK enforcement before BEGIN.
  db.exec("PRAGMA foreign_keys = OFF;");
  try {
    runSqliteImmediateTransactionSync(
      db,
      () => {
        assertSupportedSchemaVersion(db, pathname);
        const previousVersion = readSqliteUserVersion(db);
        if (previousVersion === BOT_STATE_SCHEMA_VERSION) {
          repairCanonicalSqliteIndexes(db, pathname, BOT_STATE_SCHEMA_SQL, {
            verifyPhysicalIntegrity: false,
          });
          assertCurrentStateRuntimeSchema(db, pathname);
        } else if (previousVersion === 5) {
          assertBotStateDatabaseV5ForMigration(db, { pathname });
        }
        dropLegacyStateTables(db);
        ensureAdditiveStateColumns(db);
        sessionWatchMigration.migrateSessionWatchCursorProvenance(db);
        assertCanonicalStateSchemaShape(db, pathname);
        executeCanonicalStateSchema(db, {
          includeLazyAdditiveTables: previousVersion !== BOT_STATE_SCHEMA_VERSION,
        });
        migrateLegacyCronRunLogsToTaskRuns(db);
        if (previousVersion < BOT_STATE_STRICT_SCHEMA_VERSION) {
          repairLegacyGatewayRestartHandoffsForStrictMigration(db);
          migrateSqliteSchemaToStrictInTransaction(db, BOT_STATE_SCHEMA_SQL, {
            databaseLabel: pathname,
          });
        }
        repairCanonicalSqliteIndexes(db, pathname, BOT_STATE_SCHEMA_SQL, {
          verifyPhysicalIntegrity: false,
        });
        db.exec(`PRAGMA user_version = ${BOT_STATE_SCHEMA_VERSION};`);
        executeSqliteQuerySync(
          db,
          kysely
            .insertInto("schema_meta")
            .values({
              meta_key: "primary",
              role: "global",
              schema_version: BOT_STATE_SCHEMA_VERSION,
              agent_id: null,
              app_version: VERSION,
              created_at: now,
              updated_at: now,
            })
            .onConflict((conflict) =>
              conflict.column("meta_key").doUpdateSet({
                role: "global",
                schema_version: BOT_STATE_SCHEMA_VERSION,
                agent_id: null,
                app_version: VERSION,
                updated_at: now,
              }),
            ),
        );
        assertBotStateDatabaseForMaintenance(db, { pathname });
      },
      {
        busyTimeoutMs: BOT_SQLITE_BUSY_TIMEOUT_MS,
        databaseLabel: pathname,
        operationLabel: "state.schema.ensure",
      },
    );
  } finally {
    db.exec("PRAGMA foreign_keys = ON;");
  }
}

/** Open existing shared state without creating, migrating, chmodding, or configuring it. */
export async function openExistingBotStateDatabaseReadOnly(
  options: BotStateDatabaseOptions = {},
): Promise<BotStateDatabase | undefined> {
  const env = options.env ?? process.env;
  const pathname = resolveDatabasePath(options);
  if (!existsSync(pathname)) {
    return undefined;
  }
  const terminalFailure = terminalOpenLatch.get(pathname);
  if (terminalFailure) {
    throw terminalFailure;
  }
  try {
    const quarantine = readBotDatabaseQuarantine(pathname, { env });
    if (quarantine) {
      throw createBotDatabaseVerificationError("state", pathname, quarantine.reason);
    }
  } catch (error) {
    if (error instanceof Error && error.name === "SqliteIntegrityError") {
      throw error;
    }
    // A broken quarantine store must not brick read-only diagnostics.
  }
  const prepared = await prepareSqliteReadOnlyLocation(pathname);
  let db: DatabaseSync;
  try {
    db = openNodeSqliteDatabase(prepared.location, {
      readOnly: true,
    });
  } catch (error) {
    prepared.cleanup();
    throw error;
  }
  try {
    db.exec(`PRAGMA busy_timeout = ${BOT_SQLITE_BUSY_TIMEOUT_MS};`);
    assertSupportedSchemaVersion(db, pathname);
    assertSqliteIntegrity(db, pathname);
    if (readSqliteUserVersion(db) === BOT_STATE_SCHEMA_VERSION) {
      assertBotStateDatabaseForMaintenance(db, { pathname });
    }
  } catch (error) {
    try {
      db.close();
    } catch {
      // Preserve the verification failure that explains why the database was refused.
    }
    prepared.cleanup();
    throw error;
  }
  let cleanupComplete = false;
  return {
    db,
    path: pathname,
    walMaintenance: {
      checkpoint: () => false,
      // Cleanup can fail transiently after the database closes. Keep the
      // close contract retryable until one call finishes both responsibilities.
      close: () => {
        const wasOpen = db.isOpen;
        if (!wasOpen && cleanupComplete) {
          return false;
        }
        try {
          if (wasOpen) {
            db.close();
          }
        } finally {
          cleanupComplete = prepared.cleanup();
        }
        return cleanupComplete;
      },
    },
  };
}

function assertCurrentStateRuntimeSchema(database: DatabaseSync, pathname: string): void {
  assertCanonicalStateSchemaShape(database, pathname);
  assertBotStateDatabaseForMaintenance(database, { pathname });
}

function assertStateDatabaseIntegrityBeforeMutation(
  database: DatabaseSync,
  pathname: string,
): void {
  database.exec(`PRAGMA busy_timeout = ${BOT_SQLITE_BUSY_TIMEOUT_MS};`);
  const userVersion = readSqliteUserVersion(database);
  const hasApplicationSchema = database
    .prepare("SELECT 1 FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' LIMIT 1")
    .get();
  const migrationPending =
    (userVersion === 0 && hasApplicationSchema) ||
    (userVersion > 0 && userVersion < BOT_STATE_SCHEMA_VERSION);
  if (migrationPending) {
    stateDbLog.info("state database schema migration pending; verifying integrity first", {
      fromVersion: userVersion,
      path: pathname,
      toVersion: BOT_STATE_SCHEMA_VERSION,
    });
  }
  const rebuiltIndexes =
    userVersion === BOT_STATE_SCHEMA_VERSION
      ? repairCanonicalSqliteIndexes(database, pathname, BOT_STATE_SCHEMA_SQL, {
          allowMissingColumns: true,
          validateAfterRepair: () => assertCurrentStateRuntimeSchema(database, pathname),
        })
      : [];
  if (rebuiltIndexes.length === 0) {
    // Every physical open proves the full file before schema mutation or exposure.
    assertSqliteIntegrity(database, pathname);
  }
  if (userVersion === BOT_STATE_SCHEMA_VERSION) {
    assertCurrentStateRuntimeSchema(database, pathname);
  }
}

/** Open or return a cached shared state database after schema and migration checks. */

export function openBotStateDatabase(
  options: BotStateDatabaseOptions = {},
): BotStateDatabase {
  if (options.database) {
    return options.database;
  }
  const env = options.env ?? process.env;
  const pathname = resolveDatabasePath(options);
  // Latched paths are quarantined: the recorder closed any live handle, and
  // every open fails fast here until doctor repairs the file and clears it.
  const terminalFailure = terminalOpenLatch.get(pathname);
  if (terminalFailure) {
    throw terminalFailure;
  }
  const cached = cachedDatabases.get(pathname);
  if (cached?.db.isOpen) {
    return cached;
  }
  if (cached) {
    // A closed handle can leave Kysely and WAL helpers cached; clear both before reopening.
    cached.walMaintenance.close();
    clearNodeSqliteKyselyCacheForDatabase(cached.db);
    cachedDatabases.delete(pathname);
  }
  let quarantineFailure: Error | undefined;
  try {
    const quarantine = readBotDatabaseQuarantine(pathname, { env });
    if (quarantine) {
      quarantineFailure = createBotDatabaseVerificationError(
        "state",
        pathname,
        quarantine.reason,
      );
    }
  } catch {
    // A broken quarantine store must not brick every state open.
    // The process latch and daily verifier still cover known damage.
  }
  if (quarantineFailure) {
    throw quarantineFailure;
  }
  ensureBotStatePermissions(pathname, env);
  const db = openNodeSqliteDatabase(pathname);
  const walMaintenance = (() => {
    let maintenance: SqliteWalMaintenance | undefined;
    try {
      db.exec(`PRAGMA busy_timeout = ${BOT_SQLITE_BUSY_TIMEOUT_MS};`);
      assertSupportedSchemaVersion(db, pathname);
      assertStateDatabaseIntegrityBeforeMutation(db, pathname);
      configureSqlitePreSchemaPragmas(db, {
        busyTimeoutMs: BOT_SQLITE_BUSY_TIMEOUT_MS,
      });
      maintenance = configureSqliteConnectionPragmas(db, {
        busyTimeoutMs: BOT_SQLITE_BUSY_TIMEOUT_MS,
        databaseLabel: "bot-state",
        databasePath: pathname,
        foreignKeys: true,
        synchronous: "NORMAL",
      });
      ensureSchema(db, pathname);
      return maintenance;
    } catch (err) {
      maintenance?.close();
      db.close();
      if (
        err instanceof Error &&
        (err.name === "SqliteSchemaVersionError" || isTerminalSqliteIntegrityError(err))
      ) {
        recordBotStateDatabaseOpenFailure(pathname, err);
      }
      throw err;
    }
  })();
  ensureBotStatePermissions(pathname, env);
  const database = { db, path: pathname, walMaintenance };
  cachedDatabases.set(pathname, database);
  terminalOpenLatch.clear(pathname);
  return database;
}

/** Run a synchronous immediate transaction against the shared state database. */
export function runBotStateWriteTransaction<T>(
  operation: (database: BotStateDatabase) => T,
  options: BotStateDatabaseOptions = {},
  transactionOptions: Pick<
    SqliteTransactionOptions,
    "busyTimeoutMs" | "operationLabel" | "slowTransactionHoldMs"
  > = {},
): T {
  const database = openBotStateDatabase(options);
  const result = runSqliteImmediateTransactionSync(database.db, () => operation(database), {
    busyTimeoutMs: transactionOptions.busyTimeoutMs ?? BOT_SQLITE_BUSY_TIMEOUT_MS,
    databaseLabel: database.path,
    ...transactionOptions,
    operationLabel: transactionOptions.operationLabel ?? "state.write",
  });
  try {
    ensureBotStatePermissions(database.path, options.env ?? process.env);
  } catch {
    // The write already committed; permission hardening is best-effort here so
    // callers never retry an operation that is durable in SQLite.
  }
  return result;
}

/**
 * Return a shared state handle this process already holds open, if any.
 *
 * Read-only callers use this to avoid opening a connection per call; it never
 * creates, repairs, or registers a handle.
 */
export function getBotStateDatabaseIfOpen(
  options: BotStateDatabaseOptions = {},
): BotStateDatabase | undefined {
  const cached = cachedDatabases.get(resolveDatabasePath(options));
  return cached?.db.isOpen ? cached : undefined;
}

/** Close one cached shared state database handle by exact pathname. */
export function closeBotStateDatabaseByPath(pathname: string): boolean {
  const resolvedPath = path.resolve(pathname);
  const database = cachedDatabases.get(resolvedPath);
  if (!database) {
    return false;
  }
  database.walMaintenance.close();
  clearNodeSqliteKyselyCacheForDatabase(database.db);
  if (database.db.isOpen) {
    database.db.close();
  }
  cachedDatabases.delete(resolvedPath);
  return true;
}

/** Close all cached shared state database handles. */
export function closeBotStateDatabase(): void {
  for (const database of cachedDatabases.values()) {
    database.walMaintenance.close();
    clearNodeSqliteKyselyCacheForDatabase(database.db);
    if (database.db.isOpen) {
      database.db.close();
    }
  }
  cachedDatabases.clear();
}

/** Test whether any cached shared state database handle is still open. */
export function isBotStateDatabaseOpen(): boolean {
  return Array.from(cachedDatabases.values()).some((database) => database.db.isOpen);
}

/** Close shared state handles and clear terminal failure latches for test isolation. */
export function closeBotStateDatabaseForTest(): void {
  closeBotStateDatabase();
  terminalOpenLatch.clearAll();
}
