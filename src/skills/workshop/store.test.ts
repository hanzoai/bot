import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { requireNodeSqlite } from "../../infra/node-sqlite.js";
import {
  closeBotStateDatabaseForTest,
  BOT_STATE_SCHEMA_VERSION,
  openBotStateDatabase,
} from "../../state/bot-state-db.js";
import {
  createBotTestState,
  type BotTestState,
} from "../../test-utils/bot-test-state.js";
import { listSkillProposals } from "./service.js";

let testState: BotTestState;

beforeEach(async () => {
  testState = await createBotTestState({
    layout: "state-only",
    prefix: "bot-workshop-store-",
  });
});

afterEach(async () => {
  await testState.cleanup();
});

describe("Skill Workshop SQLite store", () => {
  it("lazily ensures additive tables without changing the schema version", async () => {
    const databasePath = openBotStateDatabase().path;
    closeBotStateDatabaseForTest();
    const { DatabaseSync } = requireNodeSqlite();
    const existing = new DatabaseSync(databasePath);
    existing.exec(`
      DROP TABLE skill_workshop_proposal_origin_runs;
      DROP TABLE skill_workshop_proposal_rollbacks;
      DROP TABLE skill_workshop_proposals;
    `);
    existing.close();

    const reopened = openBotStateDatabase();
    expect(
      reopened.db
        .prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name = ?")
        .get("skill_workshop_proposals"),
    ).toBeUndefined();
    await expect(listSkillProposals()).resolves.toMatchObject({ proposals: [] });
    expect(
      reopened.db
        .prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name = ?")
        .get("skill_workshop_proposals"),
    ).toEqual({ name: "skill_workshop_proposals" });
    expect(reopened.db.prepare("PRAGMA user_version").get()).toEqual({
      user_version: BOT_STATE_SCHEMA_VERSION,
    });
  });
});
