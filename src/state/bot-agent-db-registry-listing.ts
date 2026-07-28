import { existsSync, lstatSync, statSync } from "node:fs";
import path from "node:path";
import { executeSqliteQuerySync, getNodeSqliteKysely } from "../infra/kysely-sync.js";
import { resolveSqliteDatabaseFilePaths } from "../infra/sqlite-files.js";
import { normalizeAgentId } from "../routing/session-key.js";
import type { BotRegisteredAgentDatabase } from "./bot-agent-db-contract.js";
import { withBotStateDatabaseReadOnly } from "./bot-state-db-readonly.js";
import { detectBotStateDatabaseSchemaMigrationsFromDatabase } from "./bot-state-db-schema-repair.js";
import type { DB as BotStateKyselyDatabase } from "./bot-state-db.generated.js";
import type { BotStateDatabaseOptions } from "./bot-state-db.js";
import { resolveBotStateSqlitePath } from "./bot-state-db.paths.js";

type BotAgentRegistryDatabase = Pick<BotStateKyselyDatabase, "agent_databases">;

// Registry metadata is process-stable: registry writes invalidate after each commit;
// other-process changes take effect on restart. Polling here puts schema probes back on hot reads.
let registeredAgentDatabasesMemo:
  | {
      pathname: string;
      entries: readonly BotRegisteredAgentDatabase[];
    }
  | undefined;

function resolveAgentDatabaseRegistryPath(options: BotStateDatabaseOptions): string {
  return path.resolve(options.path ?? resolveBotStateSqlitePath(options.env ?? process.env));
}

export function invalidateRegisteredAgentDatabasesMemo(
  options: BotStateDatabaseOptions,
): void {
  const pathname = resolveAgentDatabaseRegistryPath(options);
  if (registeredAgentDatabasesMemo?.pathname === pathname) {
    registeredAgentDatabasesMemo = undefined;
  }
}

function cloneRegisteredAgentDatabases(
  entries: readonly BotRegisteredAgentDatabase[],
): BotRegisteredAgentDatabase[] {
  return entries.map((entry) => ({ ...entry }));
}

function hasUnavailableMissingSqlitePath(pathname: string): boolean {
  for (const candidate of resolveSqliteDatabaseFilePaths(pathname)) {
    try {
      lstatSync(candidate);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        return true;
      }
    }
  }

  let ancestor = path.dirname(pathname);
  while (true) {
    try {
      const stat = lstatSync(ancestor);
      if (!stat.isSymbolicLink()) {
        return !stat.isDirectory();
      }
      try {
        return !statSync(ancestor).isDirectory();
      } catch {
        return true;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        return true;
      }
    }
    const parent = path.dirname(ancestor);
    if (parent === ancestor) {
      return false;
    }
    ancestor = parent;
  }
}

/** List agent databases recorded in the shared Bot state registry. */
export function listBotRegisteredAgentDatabases(
  options: BotStateDatabaseOptions = {},
): BotRegisteredAgentDatabase[] {
  const pathname = resolveAgentDatabaseRegistryPath(options);
  if (registeredAgentDatabasesMemo?.pathname === pathname) {
    return cloneRegisteredAgentDatabases(registeredAgentDatabasesMemo.entries);
  }
  if (!existsSync(pathname)) {
    if (hasUnavailableMissingSqlitePath(pathname)) {
      throw new Error(`Bot state database ${pathname} is unavailable.`);
    }
    registeredAgentDatabasesMemo = { pathname, entries: [] };
    return [];
  }
  // Discovery runs per row in list hot paths, so the legacy-schema gate and the
  // query share one process-held state handle instead of opening two
  // connections per call.
  const entries = withBotStateDatabaseReadOnly(({ db: database }) => {
    if (detectBotStateDatabaseSchemaMigrationsFromDatabase(database, pathname).length > 0) {
      throw new Error(
        `Bot state database ${pathname} has a legacy agent database registry schema; run bot doctor --fix to migrate it.`,
      );
    }
    const registryTable = database
      .prepare("SELECT type FROM sqlite_master WHERE name = 'agent_databases'")
      .get() as { type?: unknown } | undefined;
    if (!registryTable) {
      return [];
    }
    if (registryTable.type !== "table") {
      throw new Error(`Bot state database ${pathname} has an invalid agent registry.`);
    }
    const db = getNodeSqliteKysely<BotAgentRegistryDatabase>(database);
    const rows = executeSqliteQuerySync(
      database,
      db
        .selectFrom("agent_databases")
        .selectAll()
        .orderBy("agent_id", "asc")
        .orderBy("path", "asc"),
    ).rows;
    return rows.map((row) => ({
      agentId: normalizeAgentId(row.agent_id),
      path: row.path,
      schemaVersion: row.schema_version,
      lastSeenAt: row.last_seen_at,
      sizeBytes: row.size_bytes,
    }));
  }, options);
  registeredAgentDatabasesMemo = { pathname, entries };
  return cloneRegisteredAgentDatabases(entries);
}
