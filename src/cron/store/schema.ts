/** Kysely row types and table facade for the cron_jobs SQLite table. */
import type { DatabaseSync } from "node:sqlite";
import type { Insertable, Selectable } from "kysely";
import { getNodeSqliteKysely } from "../../infra/kysely-sync.js";
import type { DB as BotStateKyselyDatabase } from "../../state/bot-state-db.generated.js";

type CronJobsTable = BotStateKyselyDatabase["cron_jobs"];
type CronStoreDatabase = Pick<BotStateKyselyDatabase, "cron_job_scratch" | "cron_jobs">;

/** Read shape for rows in the cron_jobs SQLite table. */
export type CronJobRow = Selectable<CronJobsTable>;

/** Insert/update shape for rows in the cron_jobs SQLite table. */
export type CronJobInsert = Insertable<CronJobsTable>;

/** Creates the Kysely facade scoped to cron_jobs for synchronous SQLite access. */
export function getCronStoreKysely(db: DatabaseSync) {
  return getNodeSqliteKysely<CronStoreDatabase>(db);
}
