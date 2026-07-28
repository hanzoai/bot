import { existsSync } from "node:fs";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import {
  clearNodeSqliteKyselyCacheForDatabase,
  executeSqliteQuerySync,
  getNodeSqliteKysely,
} from "../infra/kysely-sync.js";
import { openNodeSqliteDatabase } from "../infra/node-sqlite.js";
import { readSqliteUserVersion } from "../infra/sqlite-user-version.js";
import type { BotSchemaVersions } from "./bot-schema-versions.js";
import type { DB as BotStateKyselyDatabase } from "./bot-state-db.generated.js";
import {
  BOT_DATABASE_SCHEMA_DOCS_URL,
  BOT_SQLITE_BUSY_TIMEOUT_MS,
} from "./bot-state-db.js";
import { resolveBotStateSqlitePath } from "./bot-state-db.paths.js";

export { BOT_DATABASE_SCHEMA_DOCS_URL } from "./bot-state-db.js";

export type IncompatibleBotDatabase = {
  kind: "agent" | "state";
  path: string;
  agentId?: string;
  foundVersion: number;
  supportedVersion: number;
  writerAppVersion?: string;
};

export type IndeterminateBotDatabase = {
  kind: "agent" | "state";
  path: string;
  reason: string;
};

export type BotDatabaseSchemaPreflight = {
  incompatible: IncompatibleBotDatabase[];
  indeterminate: IndeterminateBotDatabase[];
};

type AgentRegistryDatabase = Pick<BotStateKyselyDatabase, "agent_databases">;

/** Fatal Gateway refusal when persisted schemas were written by a newer build. */
export class BotDatabaseSchemaPreflightError extends Error {
  constructor(readonly incompatibleDatabases: readonly IncompatibleBotDatabase[]) {
    super(
      `Gateway refused startup because ${incompatibleDatabases.length} Bot database schema(s) are newer than this build. See ${BOT_DATABASE_SCHEMA_DOCS_URL}.`,
    );
    this.name = "BotDatabaseSchemaPreflightError";
  }
}

function readWriterAppVersion(database: DatabaseSync): string | undefined {
  try {
    const row = database
      .prepare("SELECT app_version FROM schema_meta WHERE meta_key = 'primary' LIMIT 1")
      .get() as { app_version?: unknown } | undefined;
    return typeof row?.app_version === "string" && row.app_version.length > 0
      ? row.app_version
      : undefined;
  } catch {
    return undefined;
  }
}

function readRegisteredAgentDatabases(database: DatabaseSync): Array<{
  agentId: string;
  path: string;
}> {
  const table = database
    .prepare("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = 'agent_databases'")
    .get();
  if (!table) {
    return [];
  }
  const db = getNodeSqliteKysely<AgentRegistryDatabase>(database);
  return executeSqliteQuerySync(
    database,
    db.selectFrom("agent_databases").select(["agent_id", "path"]),
  ).rows.flatMap((row) =>
    typeof row.agent_id === "string" && typeof row.path === "string"
      ? [{ agentId: row.agent_id, path: row.path }]
      : [],
  );
}

function errorReason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Read schema headers; report unreadable existing files without diagnosing or repairing them. */
export function preflightBotDatabaseSchemas(options: {
  env: NodeJS.ProcessEnv;
  supportedVersions: BotSchemaVersions;
}): BotDatabaseSchemaPreflight {
  const result: BotDatabaseSchemaPreflight = { incompatible: [], indeterminate: [] };
  const statePath = path.resolve(resolveBotStateSqlitePath(options.env));
  if (!existsSync(statePath)) {
    return result;
  }

  let stateDatabase: DatabaseSync | undefined;
  try {
    stateDatabase = openNodeSqliteDatabase(statePath, {
      readOnly: true,
    });
    stateDatabase.exec(`PRAGMA busy_timeout = ${BOT_SQLITE_BUSY_TIMEOUT_MS};`);
    const stateVersion = readSqliteUserVersion(stateDatabase);
    if (stateVersion > options.supportedVersions.state) {
      const writerAppVersion = readWriterAppVersion(stateDatabase);
      result.incompatible.push({
        kind: "state",
        path: statePath,
        foundVersion: stateVersion,
        supportedVersion: options.supportedVersions.state,
        ...(writerAppVersion ? { writerAppVersion } : {}),
      });
    }

    let registeredDatabases: ReturnType<typeof readRegisteredAgentDatabases>;
    try {
      registeredDatabases = readRegisteredAgentDatabases(stateDatabase);
    } catch (error) {
      result.indeterminate.push({
        kind: "state",
        path: statePath,
        reason: `agent database registry query failed: ${errorReason(error)}`,
      });
      return result;
    }

    for (const row of registeredDatabases) {
      const agentPath = path.resolve(row.path);
      if (!existsSync(agentPath)) {
        continue;
      }
      let agentDatabase: DatabaseSync | undefined;
      try {
        agentDatabase = openNodeSqliteDatabase(agentPath, {
          readOnly: true,
        });
        agentDatabase.exec(`PRAGMA busy_timeout = ${BOT_SQLITE_BUSY_TIMEOUT_MS};`);
        const agentVersion = readSqliteUserVersion(agentDatabase);
        if (agentVersion <= options.supportedVersions.agent) {
          continue;
        }
        const writerAppVersion = readWriterAppVersion(agentDatabase);
        result.incompatible.push({
          kind: "agent",
          path: agentPath,
          agentId: row.agentId,
          foundVersion: agentVersion,
          supportedVersion: options.supportedVersions.agent,
          ...(writerAppVersion ? { writerAppVersion } : {}),
        });
      } catch (error) {
        result.indeterminate.push({
          kind: "agent",
          path: agentPath,
          reason: errorReason(error),
        });
      } finally {
        agentDatabase?.close();
      }
    }
    return result;
  } catch (error) {
    result.indeterminate.push({ kind: "state", path: statePath, reason: errorReason(error) });
    return result;
  } finally {
    if (stateDatabase) {
      clearNodeSqliteKyselyCacheForDatabase(stateDatabase);
      stateDatabase.close();
    }
  }
}
