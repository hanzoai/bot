// Agent database cache tests cover bounded process-local SQLite handle ownership.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  closeBotAgentDatabasesForTest,
  disposeBotAgentDatabaseByPath,
  isBotAgentDatabaseOpen,
  listBotRegisteredAgentDatabases,
  BOT_AGENT_DB_OPEN_HANDLE_CAP,
  openBotAgentDatabase,
} from "./bot-agent-db.js";
import { closeBotStateDatabaseForTest } from "./bot-state-db.js";

const tempStateDirs: string[] = [];

function createTempStateDir(): string {
  const stateDir = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "bot-agent-db-cache-")),
  );
  tempStateDirs.push(stateDir);
  return stateDir;
}

function fillAgentDatabaseCache(env: NodeJS.ProcessEnv, prefix: string): void {
  for (let index = 0; index < BOT_AGENT_DB_OPEN_HANDLE_CAP; index += 1) {
    openBotAgentDatabase({ agentId: `${prefix}-${index}`, env });
  }
}

afterEach(() => {
  closeBotAgentDatabasesForTest();
  closeBotStateDatabaseForTest();
  for (const stateDir of tempStateDirs.splice(0)) {
    fs.rmSync(stateDir, { force: true, recursive: true });
  }
});

describe("bot agent database handle cache", () => {
  it("keeps only the capped number of open handles", () => {
    const env = { BOT_STATE_DIR: createTempStateDir() };
    const databases = Array.from({ length: BOT_AGENT_DB_OPEN_HANDLE_CAP + 1 }, (_, index) =>
      openBotAgentDatabase({ agentId: `worker-${index}`, env }),
    );
    const leastRecentlyUsed = databases[0]!;

    expect(databases.filter((database) => database.db.isOpen)).toHaveLength(
      BOT_AGENT_DB_OPEN_HANDLE_CAP,
    );
    expect(isBotAgentDatabaseOpen(leastRecentlyUsed.path)).toBe(false);
    expect(leastRecentlyUsed.db.isOpen).toBe(false);
  });

  it("refreshes cache-hit recency before evicting the true LRU handle", () => {
    const env = { BOT_STATE_DIR: createTempStateDir() };
    const recentlyUsed = openBotAgentDatabase({ agentId: "recently-used", env });
    const untouched = Array.from({ length: BOT_AGENT_DB_OPEN_HANDLE_CAP - 1 }, (_, index) =>
      openBotAgentDatabase({ agentId: `untouched-${index}`, env }),
    );
    const leastRecentlyUsed = untouched[0]!;

    expect(openBotAgentDatabase({ agentId: "recently-used", env })).toBe(recentlyUsed);
    openBotAgentDatabase({ agentId: "newest", env });

    expect(recentlyUsed.db.isOpen).toBe(true);
    expect(isBotAgentDatabaseOpen(recentlyUsed.path)).toBe(true);
    expect(leastRecentlyUsed.db.isOpen).toBe(false);
    expect(isBotAgentDatabaseOpen(leastRecentlyUsed.path)).toBe(false);
  });

  it("never evicts an LRU handle with an open transaction", () => {
    const env = { BOT_STATE_DIR: createTempStateDir() };
    const transactionOwner = openBotAgentDatabase({ agentId: "transaction-owner", env });
    transactionOwner.db.exec("BEGIN IMMEDIATE");
    try {
      const untouched = Array.from({ length: BOT_AGENT_DB_OPEN_HANDLE_CAP - 1 }, (_, index) =>
        openBotAgentDatabase({ agentId: `untouched-${index}`, env }),
      );
      const leastRecentlyUsed = untouched[0]!;
      openBotAgentDatabase({ agentId: "newest", env });

      expect(transactionOwner.db.isOpen).toBe(true);
      expect(transactionOwner.db.isTransaction).toBe(true);
      expect(isBotAgentDatabaseOpen(transactionOwner.path)).toBe(true);
      expect(leastRecentlyUsed.db.isOpen).toBe(false);
      expect(isBotAgentDatabaseOpen(leastRecentlyUsed.path)).toBe(false);
    } finally {
      transactionOwner.db.exec("ROLLBACK");
    }
  });

  it("reopens an evicted database without losing durable rows", () => {
    const env = { BOT_STATE_DIR: createTempStateDir() };
    const evicted = openBotAgentDatabase({ agentId: "evicted", env });
    evicted.db
      .prepare(
        "INSERT INTO auth_profile_state (state_key, state_json, updated_at) VALUES (?, ?, ?)",
      )
      .run("cache-eviction", JSON.stringify({ preserved: true }), 42);

    fillAgentDatabaseCache(env, "filler");
    expect(evicted.db.isOpen).toBe(false);

    const reopened = openBotAgentDatabase({ agentId: "evicted", env });
    expect(reopened).not.toBe(evicted);
    expect(
      reopened.db
        .prepare("SELECT state_json, updated_at FROM auth_profile_state WHERE state_key = ?")
        .get("cache-eviction"),
    ).toEqual({ state_json: JSON.stringify({ preserved: true }), updated_at: 42 });
  });

  it("registers a first open without refreshing registry metadata after eviction", () => {
    const env = { BOT_STATE_DIR: createTempStateDir() };
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_000);
    try {
      const evicted = openBotAgentDatabase({ agentId: "evicted", env });
      expect(
        listBotRegisteredAgentDatabases({ env }).find(
          (entry) => entry.agentId === "evicted" && entry.path === evicted.path,
        ),
      ).toMatchObject({ lastSeenAt: 1_000 });

      nowSpy.mockReturnValue(2_000);
      fillAgentDatabaseCache(env, "registry-filler");
      expect(evicted.db.isOpen).toBe(false);

      openBotAgentDatabase({ agentId: "evicted", env });
      expect(
        listBotRegisteredAgentDatabases({ env }).find(
          (entry) => entry.agentId === "evicted" && entry.path === evicted.path,
        ),
      ).toMatchObject({ lastSeenAt: 1_000 });
    } finally {
      nowSpy.mockRestore();
    }
  });

  it("validates ownership when an evicted path is requested for another agent", () => {
    const env = { BOT_STATE_DIR: createTempStateDir() };
    const evicted = openBotAgentDatabase({ agentId: "worker-a", env });
    fillAgentDatabaseCache(env, "ownership-filler");
    expect(evicted.db.isOpen).toBe(false);

    expect(() =>
      openBotAgentDatabase({ agentId: "worker-b", env, path: evicted.path }),
    ).toThrow(/belongs to agent worker-a/);
  });

  it("revalidates and registers a database after explicit disposal", () => {
    const env = { BOT_STATE_DIR: createTempStateDir() };
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_000);
    try {
      const disposed = openBotAgentDatabase({ agentId: "disposed", env });
      expect(
        listBotRegisteredAgentDatabases({ env }).find(
          (entry) => entry.agentId === "disposed" && entry.path === disposed.path,
        ),
      ).toMatchObject({ lastSeenAt: 1_000 });

      expect(disposeBotAgentDatabaseByPath(disposed.path, { env })).toBe(true);
      expect(
        listBotRegisteredAgentDatabases({ env }).some(
          (entry) => entry.agentId === "disposed" && entry.path === disposed.path,
        ),
      ).toBe(false);

      nowSpy.mockReturnValue(2_000);
      openBotAgentDatabase({ agentId: "disposed", env, path: disposed.path });
      expect(
        listBotRegisteredAgentDatabases({ env }).find(
          (entry) => entry.agentId === "disposed" && entry.path === disposed.path,
        ),
      ).toMatchObject({ lastSeenAt: 2_000 });
    } finally {
      nowSpy.mockRestore();
    }
  });
});
