import type { DatabaseSync } from "node:sqlite";
import { clearNodeSqliteKyselyCacheForDatabase } from "../infra/kysely-sync.js";
import { openNodeSqliteDatabase } from "../infra/node-sqlite.js";
import { repairCanonicalSqliteIndexes } from "../infra/sqlite-index-schema.js";
import {
  createNewerSqliteSchemaVersionError,
  readSqliteUserVersion,
} from "../infra/sqlite-user-version.js";
import { normalizeAgentId } from "../routing/session-key.js";
import { BOT_AGENT_SCHEMA_VERSION } from "./bot-agent-db-contract.js";
import {
  assertExistingAgentSchemaOwner,
  assertBotAgentSchemaContains,
  assertSupportedAgentSchemaVersion,
  readExistingAgentSchemaMeta,
} from "./bot-agent-db-schema-helpers.js";
import { ensureBotAgentDatabaseSchema } from "./bot-agent-db-schema.js";
import { BOT_AGENT_SCHEMA_SQL } from "./bot-agent-schema.generated.js";
import { BOT_SQLITE_BUSY_TIMEOUT_MS } from "./bot-state-db.js";

/** Require exact agent ownership without requiring the latest schema. */
export function assertBotAgentDatabaseOwner(
  database: DatabaseSync,
  options: { agentId: string; pathname: string },
): NonNullable<ReturnType<typeof readExistingAgentSchemaMeta>> {
  const agentId = normalizeAgentId(options.agentId);
  const metadata = readExistingAgentSchemaMeta(database);
  if (!metadata) {
    throw new Error(
      `Bot agent database ${options.pathname} has no schema ownership metadata.`,
    );
  }
  assertExistingAgentSchemaOwner(metadata, agentId, options.pathname);
  if (metadata.agentId !== agentId) {
    throw new Error(
      `Bot agent database ${options.pathname} belongs to agent ${metadata.agentId}; requested agent ${agentId}.`,
    );
  }
  return metadata;
}

/** Require the exact agent owner and schema before offline file maintenance. */
export function assertBotAgentDatabaseForMaintenance(
  database: DatabaseSync,
  options: { agentId: string; pathname: string },
): void {
  const metadata = assertBotAgentDatabaseOwner(database, options);

  const userVersion = readSqliteUserVersion(database);
  if (userVersion > BOT_AGENT_SCHEMA_VERSION) {
    throw createNewerSqliteSchemaVersionError(
      "Bot agent database",
      options.pathname,
      userVersion,
      BOT_AGENT_SCHEMA_VERSION,
    );
  }
  if (userVersion !== BOT_AGENT_SCHEMA_VERSION) {
    throw new Error(
      `Bot agent database ${options.pathname} uses schema version ${userVersion}; run bot doctor --fix before compacting it.`,
    );
  }
  if (metadata.schemaVersion !== BOT_AGENT_SCHEMA_VERSION) {
    throw new Error(
      `Bot agent database ${options.pathname} metadata schema version ${metadata.schemaVersion ?? "invalid"} does not match ${BOT_AGENT_SCHEMA_VERSION}; run bot doctor --fix before compacting it.`,
    );
  }
  assertBotAgentSchemaContains(database, options.pathname, BOT_AGENT_SCHEMA_SQL);
}

/** Upgrade or repair a supported owned schema before strict offline maintenance. */
export function migrateBotAgentDatabaseForMaintenance(options: {
  agentId: string;
  pathname: string;
}): void {
  const agentId = normalizeAgentId(options.agentId);
  const database = openNodeSqliteDatabase(options.pathname);
  try {
    database.exec(`PRAGMA busy_timeout = ${BOT_SQLITE_BUSY_TIMEOUT_MS};`);
    const metadata = readExistingAgentSchemaMeta(database);
    if (!metadata) {
      return;
    }
    assertExistingAgentSchemaOwner(metadata, agentId, options.pathname);
    assertSupportedAgentSchemaVersion(database, options.pathname);
    const userVersion = readSqliteUserVersion(database);
    const metadataVersion = metadata.schemaVersion;
    const hasCurrentVersion =
      userVersion === BOT_AGENT_SCHEMA_VERSION &&
      metadataVersion === BOT_AGENT_SCHEMA_VERSION;
    const hasSupportedOlderVersion =
      userVersion >= 1 &&
      userVersion < BOT_AGENT_SCHEMA_VERSION &&
      metadataVersion !== null &&
      metadataVersion === userVersion &&
      metadataVersion >= 1 &&
      metadataVersion < BOT_AGENT_SCHEMA_VERSION;
    if (!hasCurrentVersion && !hasSupportedOlderVersion) {
      return;
    }
    if (hasCurrentVersion) {
      repairCanonicalSqliteIndexes(database, options.pathname, BOT_AGENT_SCHEMA_SQL, {
        // The maintenance contract is the runtime owner/schema contract plus
        // an exact user_version gate, so table drift rolls this savepoint back.
        validateAfterRepair: () =>
          assertBotAgentDatabaseForMaintenance(database, {
            agentId,
            pathname: options.pathname,
          }),
      });
      assertBotAgentDatabaseForMaintenance(database, {
        agentId,
        pathname: options.pathname,
      });
      return;
    }
    ensureBotAgentDatabaseSchema(database, {
      agentId,
      path: options.pathname,
    });
  } finally {
    clearNodeSqliteKyselyCacheForDatabase(database);
    database.close();
  }
}
