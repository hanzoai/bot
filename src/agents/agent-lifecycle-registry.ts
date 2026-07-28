import crypto from "node:crypto";
import path from "node:path";
import { normalizeAgentId } from "../routing/session-key.js";
import { resolveGlobalMap } from "../shared/global-singleton.js";
import {
  beginAgentDeletionJournal,
  claimCompletedAgentDeletionJournal,
  completeAgentDeletionJournal,
  readAgentDeletionJournal,
  removeAgentDeletionJournal,
  updateAgentDeletionJournalDatabasePaths,
  updateAgentDeletionJournalCleanupPaths,
  type AgentDeletionJournalCleanupPath,
  type AgentDeletionJournalEntry,
} from "../state/agent-deletion-journal.js";
import type { BotStateDatabaseOptions } from "../state/bot-state-db-contract.js";
import { resolveBotStateSqlitePath } from "../state/bot-state-db.paths.js";

const AGENT_LIFECYCLE_KEY = Symbol.for("bot.agentLifecycle");
const agentLifecycle = resolveGlobalMap<string, "deleting" | "deleted">(AGENT_LIFECYCLE_KEY);

export class AgentDeletionAuthorityRollbackError extends AggregateError {}

export class AgentDeletionCommitUncertainError extends Error {
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause), { cause });
  }
}

function lifecycleKey(agentId: string, options: BotStateDatabaseOptions): string {
  const databasePath = path.resolve(
    options.path ?? resolveBotStateSqlitePath(options.env ?? process.env),
  );
  return `${databasePath}\0${agentId}`;
}

/** Fence authority producers while an agent deletion is pending or committed. */
export function beginAgentDeletion(
  entry: Omit<
    AgentDeletionJournalEntry,
    | "createdAt"
    | "operationId"
    | "cleanupCompleted"
    | "databasePaths"
    | "cleanupPaths"
    | "deleteFiles"
  > & {
    databasePaths?: string[];
    cleanupPaths?: AgentDeletionJournalCleanupPath[];
    deleteFiles?: boolean;
  },
  options: BotStateDatabaseOptions = {},
): {
  entry: AgentDeletionJournalEntry;
  commit: () => void;
  fenceDatabasePaths: (paths: readonly string[]) => void;
  fenceCleanupPaths: (paths: readonly AgentDeletionJournalCleanupPath[]) => void;
  finish: () => void;
  rollback: () => void;
} {
  const id = normalizeAgentId(entry.agentId);
  const key = lifecycleKey(id, options);
  const operationId = crypto.randomUUID();
  const journal = beginAgentDeletionJournal(
    { ...entry, agentId: id, operationId, deleteFiles: entry.deleteFiles !== false },
    options,
  );
  agentLifecycle.set(key, "deleting");
  return {
    entry: journal,
    commit: () => agentLifecycle.set(key, "deleted"),
    fenceDatabasePaths: (paths) => {
      if (!updateAgentDeletionJournalDatabasePaths(id, operationId, paths, options)) {
        throw new Error(`Failed to fence database cleanup paths for agent ${id}.`);
      }
      journal.databasePaths = [...new Set(paths.map((entryPath) => path.resolve(entryPath)))];
    },
    fenceCleanupPaths: (paths) => {
      if (!updateAgentDeletionJournalCleanupPaths(id, operationId, paths, options)) {
        throw new Error(`Failed to fence cleanup paths for agent ${id}.`);
      }
      journal.cleanupPaths = [...paths];
    },
    finish: () => {
      if (completeAgentDeletionJournal(id, operationId, options)) {
        agentLifecycle.set(key, "deleted");
      }
    },
    rollback: () => {
      if (removeAgentDeletionJournal(id, operationId, options)) {
        agentLifecycle.delete(key);
      }
    },
  };
}

/** Atomically claim a completed deletion tombstone for a newly created identity. */
export function claimCompletedAgentDeletion(
  agentId: string,
  operationId: string,
  options: BotStateDatabaseOptions = {},
): boolean {
  const id = normalizeAgentId(agentId);
  const removed = claimCompletedAgentDeletionJournal(id, operationId, options);
  if (removed) {
    agentLifecycle.delete(lifecycleKey(id, options));
  }
  return removed;
}

/** Return whether this process must refuse new authority for an agent id. */
export function isAgentDeletionBlocked(
  agentId: string,
  options: BotStateDatabaseOptions = {},
): boolean {
  const id = normalizeAgentId(agentId);
  const key = lifecycleKey(id, options);
  const journal = readAgentDeletionJournal(id, options);
  if (!journal) {
    agentLifecycle.delete(key);
  }
  return Boolean(journal);
}
