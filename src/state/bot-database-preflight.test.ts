import { afterAll, afterEach, describe, expect, it } from "vitest";
import packageJson from "../../package.json" with { type: "json" };
import { cleanupTempDirs, makeTempDir } from "../../test/helpers/temp-dir.js";
import { requireNodeSqlite } from "../infra/node-sqlite.js";
import {
  closeBotAgentDatabasesForTest,
  BOT_AGENT_SCHEMA_VERSION,
  openBotAgentDatabase,
} from "./bot-agent-db.js";
import { preflightBotDatabaseSchemas } from "./bot-database-preflight.js";
import {
  closeBotStateDatabaseForTest,
  BOT_STATE_SCHEMA_VERSION,
  openBotStateDatabase,
} from "./bot-state-db.js";

const tempDirs: string[] = [];

afterEach(() => {
  closeBotAgentDatabasesForTest();
  closeBotStateDatabaseForTest();
});

afterAll(() => cleanupTempDirs(tempDirs));

describe("Bot database schema preflight", () => {
  it("keeps package schema support metadata aligned", () => {
    expect(packageJson.bot.schemaVersions).toEqual({
      state: BOT_STATE_SCHEMA_VERSION,
      agent: BOT_AGENT_SCHEMA_VERSION,
    });
  });

  it("collects newer state and registered agent schemas with writer builds", () => {
    const stateDir = makeTempDir(tempDirs, "bot-database-preflight-");
    const env = { BOT_STATE_DIR: stateDir };
    const statePath = openBotStateDatabase({ env }).path;
    const agentPath = openBotAgentDatabase({ agentId: "worker-1", env }).path;
    closeBotAgentDatabasesForTest();
    closeBotStateDatabaseForTest();

    const { DatabaseSync } = requireNodeSqlite();
    const state = new DatabaseSync(statePath);
    try {
      state.exec(`PRAGMA user_version = ${BOT_STATE_SCHEMA_VERSION + 1};`);
      state
        .prepare("UPDATE schema_meta SET app_version = ? WHERE meta_key = 'primary'")
        .run("state-writer-build");
    } finally {
      state.close();
    }
    const agent = new DatabaseSync(agentPath);
    try {
      agent.exec(`PRAGMA user_version = ${BOT_AGENT_SCHEMA_VERSION + 1};`);
      agent
        .prepare("UPDATE schema_meta SET app_version = ? WHERE meta_key = 'primary'")
        .run("agent-writer-build");
    } finally {
      agent.close();
    }

    expect(
      preflightBotDatabaseSchemas({
        env,
        supportedVersions: {
          state: BOT_STATE_SCHEMA_VERSION,
          agent: BOT_AGENT_SCHEMA_VERSION,
        },
      }),
    ).toEqual({
      incompatible: [
        {
          kind: "state",
          path: statePath,
          foundVersion: BOT_STATE_SCHEMA_VERSION + 1,
          supportedVersion: BOT_STATE_SCHEMA_VERSION,
          writerAppVersion: "state-writer-build",
        },
        {
          kind: "agent",
          path: agentPath,
          agentId: "worker-1",
          foundVersion: BOT_AGENT_SCHEMA_VERSION + 1,
          supportedVersion: BOT_AGENT_SCHEMA_VERSION,
          writerAppVersion: "agent-writer-build",
        },
      ],
      indeterminate: [],
    });
  });

  it("reports an existing unreadable state database as indeterminate", () => {
    const stateDir = makeTempDir(tempDirs, "bot-database-preflight-unreadable-state-");
    const env = { BOT_STATE_DIR: stateDir };
    const statePath = openBotStateDatabase({ env }).path;
    closeBotStateDatabaseForTest();
    fs.writeFileSync(statePath, "not a sqlite database");

    expect(
      preflightBotDatabaseSchemas({
        env,
        supportedVersions: {
          state: BOT_STATE_SCHEMA_VERSION,
          agent: BOT_AGENT_SCHEMA_VERSION,
        },
      }),
    ).toEqual({
      incompatible: [],
      indeterminate: [
        { kind: "state", path: statePath, reason: expect.stringMatching(/database|file/iu) },
      ],
    });
  });

  it("reports a failed agent registry query as indeterminate", () => {
    const stateDir = makeTempDir(tempDirs, "bot-database-preflight-registry-");
    const env = { BOT_STATE_DIR: stateDir };
    const statePath = openBotStateDatabase({ env }).path;
    closeBotStateDatabaseForTest();
    const { DatabaseSync } = requireNodeSqlite();
    const state = new DatabaseSync(statePath);
    try {
      state.exec("DROP TABLE agent_databases; CREATE TABLE agent_databases (bad TEXT) STRICT;");
    } finally {
      state.close();
    }

    expect(
      preflightBotDatabaseSchemas({
        env,
        supportedVersions: {
          state: BOT_STATE_SCHEMA_VERSION,
          agent: BOT_AGENT_SCHEMA_VERSION,
        },
      }),
    ).toEqual({
      incompatible: [],
      indeterminate: [
        {
          kind: "state",
          path: statePath,
          reason: expect.stringContaining("agent database registry query failed"),
        },
      ],
    });
  });

  it("reports an existing unreadable registered agent database as indeterminate", () => {
    const stateDir = makeTempDir(tempDirs, "bot-database-preflight-unreadable-agent-");
    const env = { BOT_STATE_DIR: stateDir };
    const agentPath = openBotAgentDatabase({ agentId: "worker-1", env }).path;
    closeBotAgentDatabasesForTest();
    closeBotStateDatabaseForTest();
    fs.writeFileSync(agentPath, "not a sqlite database");

    expect(
      preflightBotDatabaseSchemas({
        env,
        supportedVersions: {
          state: BOT_STATE_SCHEMA_VERSION,
          agent: BOT_AGENT_SCHEMA_VERSION,
        },
      }),
    ).toEqual({
      incompatible: [],
      indeterminate: [
        { kind: "agent", path: agentPath, reason: expect.stringMatching(/database|file/iu) },
      ],
    });
  });
});
import fs from "node:fs";
