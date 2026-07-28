// Test-only helpers for seeding and inspecting canonical commitment rows.
import { executeSqliteQuerySync, getNodeSqliteKysely } from "../infra/kysely-sync.js";
import {
  openBotStateDatabase,
  runBotStateWriteTransaction,
} from "../state/bot-state-db.js";
import {
  commitmentRecordFromRow,
  commitmentRecordToRow,
  type CommitmentsDatabase,
} from "./store-record.js";
import type { CommitmentRecord } from "./types.js";

function assertTestRuntime(): void {
  if (!process.env.VITEST && process.env.NODE_ENV !== "test") {
    throw new Error("commitment store test helpers are unavailable outside tests");
  }
}

export function seedCommitmentsForTest(records: CommitmentRecord[]): void {
  assertTestRuntime();
  runBotStateWriteTransaction(({ db }) => {
    const commitmentsDb = getNodeSqliteKysely<CommitmentsDatabase>(db);
    executeSqliteQuerySync(db, commitmentsDb.deleteFrom("commitments"));
    for (let offset = 0; offset < records.length; offset += 500) {
      executeSqliteQuerySync(
        db,
        commitmentsDb
          .insertInto("commitments")
          .values(records.slice(offset, offset + 500).map(commitmentRecordToRow)),
      );
    }
  });
}

export function readCommitmentsForTest(): CommitmentRecord[] {
  assertTestRuntime();
  const database = openBotStateDatabase();
  return executeSqliteQuerySync(
    database.db,
    getNodeSqliteKysely<CommitmentsDatabase>(database.db)
      .selectFrom("commitments")
      .selectAll()
      .orderBy("id", "asc"),
  ).rows.map(commitmentRecordFromRow);
}
