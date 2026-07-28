import fs from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { resolveAllAgentSessionStoreCandidateTargetsSync } from "../config/sessions/targets.js";
import type { SessionEntry } from "../config/sessions/types.js";
import type { BotConfig } from "../config/types.bot.js";
import { executeSqliteQuerySync, getNodeSqliteKysely } from "../infra/kysely-sync.js";
import { normalizeLegacySessionEntryDelivery } from "../infra/state-migrations.legacy-session-store.js";
import { withBotAgentDatabaseReadOnly } from "../state/bot-agent-db-readonly.js";
import type { DB as BotAgentKyselyDatabase } from "../state/bot-agent-db.generated.js";
import {
  closeBotAgentDatabaseByPath,
  isBotAgentDatabaseOpen,
  runBotAgentWriteTransaction,
} from "../state/bot-agent-db.js";
import {
  deliveryContextFromSession,
  sessionDeliveryChannel,
} from "../utils/delivery-context.shared.js";
import { resolveTargetSqlitePath } from "./doctor-session-sqlite-readers.js";

export type SessionDeliveryStateRepairReport = {
  found: number;
  repaired: number;
  scannedStores: number;
};

type DeliveryRewrite = {
  accountId: string | null;
  channel: string | null;
  currentSessionId: string;
  entryJson: string;
  sessionKey: string;
};

/** Scan or rewrite legacy delivery fields inside existing session row JSON. */
export function repairCanonicalSessionDeliveryStates(params: {
  apply: boolean;
  cfg: BotConfig;
  env: NodeJS.ProcessEnv;
}): SessionDeliveryStateRepairReport {
  const targets = listExistingAgentDatabaseTargets(params.cfg, params.env);
  let found = 0;
  let repaired = 0;
  for (const target of targets) {
    const inspected = withBotAgentDatabaseReadOnly(
      (database) => collectDeliveryRewrites(database.db),
      { agentId: target.agentId, env: params.env, path: target.sqlitePath },
    );
    if (!inspected.found) {
      continue;
    }
    found += inspected.value.length;
    if (!params.apply || inspected.value.length === 0) {
      continue;
    }
    const wasOpen = isBotAgentDatabaseOpen(target.sqlitePath);
    try {
      repaired += runBotAgentWriteTransaction(
        (database) => applyDeliveryRewrites(database.db),
        { agentId: target.agentId, env: params.env, path: target.sqlitePath },
        { operationLabel: "doctor.canonicalize-session-delivery-state" },
      );
    } finally {
      if (!wasOpen) {
        closeBotAgentDatabaseByPath(target.sqlitePath);
      }
    }
  }
  return { found, repaired, scannedStores: targets.length };
}

function listExistingAgentDatabaseTargets(
  cfg: BotConfig,
  env: NodeJS.ProcessEnv,
): Array<{ agentId: string; sqlitePath: string }> {
  const seenPaths = new Set<string>();
  return resolveAllAgentSessionStoreCandidateTargetsSync(cfg, { env }).flatMap((target) => {
    const sqlitePath = resolveTargetSqlitePath(target);
    if (seenPaths.has(sqlitePath) || !fs.existsSync(sqlitePath)) {
      return [];
    }
    seenPaths.add(sqlitePath);
    return [{ agentId: target.agentId, sqlitePath }];
  });
}

function collectDeliveryRewrites(database: DatabaseSync): DeliveryRewrite[] {
  const db = getNodeSqliteKysely<BotAgentKyselyDatabase>(database);
  const rows = executeSqliteQuerySync(
    database,
    db.selectFrom("session_nodes").select(["session_key", "current_session_id", "entry_json"]),
  ).rows;
  return rows.flatMap((row) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(row.entry_json);
    } catch {
      return [];
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return [];
    }
    const entry = parsed as SessionEntry;
    const normalizedEntry = normalizeLegacySessionEntryDelivery(entry);
    const entryJson = JSON.stringify(normalizedEntry);
    return entryJson === row.entry_json
      ? []
      : [
          {
            accountId: deliveryContextFromSession(normalizedEntry)?.accountId ?? null,
            channel: sessionDeliveryChannel(normalizedEntry) ?? null,
            currentSessionId: row.current_session_id,
            entryJson,
            sessionKey: row.session_key,
          },
        ];
  });
}

function applyDeliveryRewrites(database: DatabaseSync): number {
  const db = getNodeSqliteKysely<BotAgentKyselyDatabase>(database);
  const rewrites = collectDeliveryRewrites(database);
  for (const rewrite of rewrites) {
    executeSqliteQuerySync(
      database,
      db
        .updateTable("session_nodes")
        .set({ entry_json: rewrite.entryJson })
        .where("session_key", "=", rewrite.sessionKey),
    );
    executeSqliteQuerySync(
      database,
      db
        .updateTable("session_windows")
        .set({ account_id: rewrite.accountId, channel: rewrite.channel })
        .where("session_id", "=", rewrite.currentSessionId),
    );
  }
  return rewrites.length;
}
