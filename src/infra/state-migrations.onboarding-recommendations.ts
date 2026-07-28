import { existsSync } from "node:fs";
import { resolveAgentWorkspaceDir, resolveDefaultAgentId } from "../agents/agent-scope.js";
import { resolveWorkspaceStateIdentity } from "../agents/workspace-state-store.js";
import type { BotConfig } from "../config/config.js";
import type { DB as BotStateKyselyDatabase } from "../state/bot-state-db.generated.js";
import { runBotStateWriteTransaction } from "../state/bot-state-db.js";
import { resolveBotStateSqlitePath } from "../state/bot-state-db.paths.js";
import {
  executeSqliteQuerySync,
  executeSqliteQueryTakeFirstSync,
  getNodeSqliteKysely,
} from "./kysely-sync.js";
import type { MigrationMessages } from "./state-migrations.types.js";

const LEGACY_ONBOARDING_RECOMMENDATIONS_KEY = "primary";

type OnboardingRecommendationsMigrationDatabase = Pick<
  BotStateKyselyDatabase,
  "onboarding_recommendations"
>;

/** Move the shipped singleton row into the default workspace during doctor repair. */
export function migrateLegacyOnboardingRecommendationsScope(params: {
  cfg: BotConfig;
  env?: NodeJS.ProcessEnv;
}): MigrationMessages {
  const env = params.env ?? process.env;
  if (!existsSync(resolveBotStateSqlitePath(env))) {
    return { changes: [], warnings: [] };
  }

  try {
    const workspaceDir = resolveAgentWorkspaceDir(
      params.cfg,
      resolveDefaultAgentId(params.cfg),
      env,
    );
    const workspaceKey = resolveWorkspaceStateIdentity(workspaceDir).workspaceKey;
    const outcome = runBotStateWriteTransaction(
      ({ db: database }) => {
        const db = getNodeSqliteKysely<OnboardingRecommendationsMigrationDatabase>(database);
        const legacy = executeSqliteQueryTakeFirstSync(
          database,
          db
            .selectFrom("onboarding_recommendations")
            .select("config_key")
            .where("config_key", "=", LEGACY_ONBOARDING_RECOMMENDATIONS_KEY),
        );
        if (!legacy) {
          return "unchanged" as const;
        }
        const scoped = executeSqliteQueryTakeFirstSync(
          database,
          db
            .selectFrom("onboarding_recommendations")
            .select("config_key")
            .where("config_key", "=", workspaceKey),
        );
        if (scoped) {
          executeSqliteQuerySync(
            database,
            db
              .deleteFrom("onboarding_recommendations")
              .where("config_key", "=", LEGACY_ONBOARDING_RECOMMENDATIONS_KEY),
          );
          return "removed-legacy" as const;
        }
        executeSqliteQuerySync(
          database,
          db
            .updateTable("onboarding_recommendations")
            .set({ config_key: workspaceKey })
            .where("config_key", "=", LEGACY_ONBOARDING_RECOMMENDATIONS_KEY),
        );
        return "migrated" as const;
      },
      { env },
      { operationLabel: "onboarding.recommendations.migrate-scope" },
    );

    if (outcome === "migrated") {
      return {
        changes: ["Migrated onboarding recommendation state to the default workspace scope."],
        warnings: [],
      };
    }
    if (outcome === "removed-legacy") {
      return {
        changes: [
          "Removed ambiguous legacy onboarding recommendation state; kept the default workspace record.",
        ],
        warnings: [],
      };
    }
    return { changes: [], warnings: [] };
  } catch (err) {
    return {
      changes: [],
      warnings: [`Failed migrating onboarding recommendation workspace scope: ${String(err)}`],
    };
  }
}
