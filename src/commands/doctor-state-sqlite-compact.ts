/** Explicit doctor maintenance for the canonical shared state SQLite database. */
import fs from "node:fs";
import { resolveSqliteDatabaseFilePaths } from "../infra/sqlite-files.js";
import { clearBotDatabaseQuarantine } from "../state/bot-quarantine-store.js";
import {
  assertBotStateDatabaseForMaintenance,
  clearBotStateDatabaseOpenFailure,
  ensureBotStatePermissions,
  isBotStateDatabaseOpen,
} from "../state/bot-state-db.js";
import { resolveBotStateSqlitePath } from "../state/bot-state-db.paths.js";
import {
  compactDoctorSqliteFile,
  type DoctorSqliteCompactSnapshot,
} from "./doctor-sqlite-compact.js";
import { withDoctorSqliteMaintenanceLock } from "./doctor-sqlite-maintenance-lock.js";

type DoctorStateSqliteCompactReport =
  | {
      mode: "compact";
      path: string;
      reason: "missing";
      skipped: true;
    }
  | {
      after: DoctorSqliteCompactSnapshot;
      before: DoctorSqliteCompactSnapshot;
      integrityCheck: "ok";
      mode: "compact";
      path: string;
      reclaimedBytes: number;
      skipped: false;
    };

type DoctorStateSqliteCompactOptions = {
  env?: NodeJS.ProcessEnv;
};

type DoctorStateSqliteCompactDeps = {
  busyTimeoutMs?: number;
  withMaintenanceLock?: typeof withDoctorSqliteMaintenanceLock;
};

/** Compact only the canonical shared state database resolved for this invocation. */
export async function runDoctorStateSqliteCompact(
  options: DoctorStateSqliteCompactOptions = {},
  deps: DoctorStateSqliteCompactDeps = {},
): Promise<DoctorStateSqliteCompactReport> {
  const env = options.env ?? process.env;
  const sqlitePath = resolveBotStateSqlitePath(env);
  const stat = readCanonicalStateDatabaseStat(sqlitePath);
  if (!stat) {
    return {
      mode: "compact",
      path: sqlitePath,
      reason: "missing",
      skipped: true,
    };
  }
  if (!stat.isFile()) {
    throw new Error(`Canonical Bot state database is not a regular file: ${sqlitePath}`);
  }
  const withMaintenanceLock = deps.withMaintenanceLock ?? withDoctorSqliteMaintenanceLock;
  return await withMaintenanceLock({
    env,
    operation: "state SQLite compaction",
    protectedPaths: resolveSqliteDatabaseFilePaths(sqlitePath),
    run: () => {
      if (isBotStateDatabaseOpen()) {
        throw new Error(
          "The shared Bot state database is already open in this process. Stop Bot and retry.",
        );
      }

      const compact = compactDoctorSqliteFile({
        afterSuccess: () => {
          if (!clearBotDatabaseQuarantine(sqlitePath, { env })) {
            throw new Error(
              `Bot state database ${sqlitePath} was compacted, but its persisted quarantine record could not be cleared. Rerun bot doctor --fix so the database is not refused again.`,
            );
          }
          clearBotStateDatabaseOpenFailure(sqlitePath);
          ensureBotStatePermissions(sqlitePath, env);
        },
        ...(deps.busyTimeoutMs !== undefined ? { busyTimeoutMs: deps.busyTimeoutMs } : {}),
        sqlitePath,
        validateBeforeMutation: (database) =>
          assertBotStateDatabaseForMaintenance(database, { pathname: sqlitePath }),
      });
      return {
        ...compact,
        mode: "compact",
        path: sqlitePath,
        skipped: false,
      };
    },
  });
}

function readCanonicalStateDatabaseStat(sqlitePath: string): fs.Stats | undefined {
  try {
    return fs.lstatSync(sqlitePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}
