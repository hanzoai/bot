import fs from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { cleanupTempDirs, makeTempDir } from "../../../test/helpers/temp-dir.js";
import {
  closeBotAgentDatabasesForTest,
  isBotAgentDatabaseOpen,
  resolveBotAgentSqlitePath,
} from "../../state/bot-agent-db.js";
import {
  closeBotStateDatabaseForTest,
  openBotStateDatabase,
} from "../../state/bot-state-db.js";
import {
  listSessionEntries,
  listSessionEntriesReadOnly,
  upsertSessionEntry,
} from "./session-accessor.js";

const tempDirs: string[] = [];

function countRegisteredAgentDatabases(env: NodeJS.ProcessEnv): number {
  const row = openBotStateDatabase({ env })
    .db.prepare("SELECT count(*) AS count FROM agent_databases")
    .get() as { count: number };
  return row.count;
}

function clearRegisteredAgentDatabases(env: NodeJS.ProcessEnv): void {
  openBotStateDatabase({ env }).db.prepare("DELETE FROM agent_databases").run();
}

afterEach(() => {
  closeBotAgentDatabasesForTest();
  closeBotStateDatabaseForTest();
  cleanupTempDirs(tempDirs);
});

describe("session accessor readonly listing", () => {
  it("returns the same entries as the writable listing for a populated agent database", async () => {
    const stateDir = makeTempDir(tempDirs, "bot-session-readonly-populated-");
    const env = { BOT_STATE_DIR: stateDir };
    const listScope = { agentId: "worker-1", env };

    await upsertSessionEntry(
      { ...listScope, sessionKey: "agent:worker-1:main" },
      { sessionId: "session-1", updatedAt: 10 },
    );
    await upsertSessionEntry(
      { ...listScope, sessionKey: "agent:worker-1:telegram:dm:42" },
      { sessionId: "session-2", updatedAt: 20 },
    );
    const writableEntries = listSessionEntries(listScope);
    closeBotAgentDatabasesForTest();

    expect(listSessionEntriesReadOnly(listScope)).toEqual(writableEntries);
  });

  it("returns an empty list without creating or registering a missing agent database", () => {
    const stateDir = makeTempDir(tempDirs, "bot-session-readonly-missing-");
    const env = { BOT_STATE_DIR: stateDir };
    const agentId = "worker-1";
    const databasePath = resolveBotAgentSqlitePath({ agentId, env });
    clearRegisteredAgentDatabases(env);

    expect(listSessionEntriesReadOnly({ agentId, env })).toEqual([]);
    expect(fs.existsSync(databasePath)).toBe(false);
    expect(countRegisteredAgentDatabases(env)).toBe(0);
  });

  it("does not register a populated database during readonly health-style listing", async () => {
    const stateDir = makeTempDir(tempDirs, "bot-session-readonly-registry-");
    const env = { BOT_STATE_DIR: stateDir };
    const agentId = "worker-1";
    const scope = { agentId, env };

    await upsertSessionEntry(
      { ...scope, sessionKey: "agent:worker-1:main" },
      { sessionId: "session-1", updatedAt: 10 },
    );
    const databasePath = resolveBotAgentSqlitePath({ agentId, env });
    closeBotAgentDatabasesForTest();
    clearRegisteredAgentDatabases(env);

    expect(listSessionEntriesReadOnly(scope)).toHaveLength(1);
    expect(countRegisteredAgentDatabases(env)).toBe(0);
    expect(isBotAgentDatabaseOpen(databasePath)).toBe(false);
  });
});
