import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { clearNodeSqliteKyselyCacheForDatabase } from "../infra/kysely-sync.js";
import { openNodeSqliteDatabase } from "../infra/node-sqlite.js";
import {
  createNewerSqliteSchemaVersionError,
  readSqliteUserVersion,
} from "../infra/sqlite-user-version.js";
import {
  getBotStateDatabaseIfOpen,
  BOT_SQLITE_BUSY_TIMEOUT_MS,
  BOT_STATE_SCHEMA_VERSION,
  type BotStateDatabaseOptions,
} from "./bot-state-db.js";
import { resolveBotStateSqlitePath } from "./bot-state-db.paths.js";

type BotStateReadOnlyDatabase = {
  db: DatabaseSync;
  path: string;
};

function assertSupportedSchemaVersion(db: DatabaseSync, pathname: string): void {
  const userVersion = readSqliteUserVersion(db);
  if (userVersion > BOT_STATE_SCHEMA_VERSION) {
    throw createNewerSqliteSchemaVersionError(
      "Bot state database",
      pathname,
      userVersion,
      BOT_STATE_SCHEMA_VERSION,
    );
  }
}

/**
 * Read shared state without joining the writable lifecycle.
 *
 * CLI metadata reads can overlap a live Gateway. Keep them off schema repair,
 * journal-mode setup, checkpoints, and permission mutation owned by writers.
 */
export function withBotStateDatabaseReadOnly<T>(
  operation: (database: BotStateReadOnlyDatabase) => T,
  options: BotStateDatabaseOptions = {},
): T {
  const pathname = path.resolve(
    options.path ?? resolveBotStateSqlitePath(options.env ?? process.env),
  );
  // Reusing a handle this process already holds keeps row loops cheap: opening
  // and closing a connection per call made shared-state reads scale with row
  // count. An in-flight transaction is skipped so callers never observe
  // uncommitted rows a fresh read-only connection could not have seen.
  const opened = getBotStateDatabaseIfOpen(options);
  if (opened && !opened.db.isTransaction) {
    // A newer build can migrate this file while the handle stays open, so the
    // forward-compatibility gate still runs before any reused read.
    assertSupportedSchemaVersion(opened.db, pathname);
    return operation(opened);
  }
  const db = openNodeSqliteDatabase(pathname, { readOnly: true });
  try {
    db.exec(`PRAGMA busy_timeout = ${BOT_SQLITE_BUSY_TIMEOUT_MS};`);
    assertSupportedSchemaVersion(db, pathname);
    return operation({ db, path: pathname });
  } finally {
    clearNodeSqliteKyselyCacheForDatabase(db);
    db.close();
  }
}
