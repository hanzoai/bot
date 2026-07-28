import { spawn } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { executeSqliteQuerySync, getNodeSqliteKysely } from "../infra/kysely-sync.js";
import { withBotTestState } from "../test-utils/bot-test-state.js";
import { closeBotAgentDatabasesForTest } from "./bot-agent-db.js";
import type { DB as BotStateKyselyDatabase } from "./bot-state-db.generated.js";
import {
  closeBotStateDatabaseForTest,
  runBotStateWriteTransaction,
} from "./bot-state-db.js";
import { withBotStateLease } from "./bot-state-lease.js";

type LeaseDatabase = Pick<BotStateKyselyDatabase, "state_leases">;

afterEach(() => {
  closeBotAgentDatabasesForTest();
  closeBotStateDatabaseForTest();
});

describe("Bot state lease", () => {
  it("releases ownership when a CLI exits from inside the leased operation", async () => {
    await withBotTestState({ label: "core-state-lease-process-exit" }, async (state) => {
      const leaseModuleUrl = pathToFileURL(path.resolve("src/state/bot-state-lease.ts")).href;
      const childScript = await state.writeText(
        "lease-process-exit-child.mts",
        `
          import { withBotStateLease } from ${JSON.stringify(leaseModuleUrl)};
          const stateDir = process.argv[2];
          await withBotStateLease({
            scope: "core:test",
            key: "process-exit",
            database: { scope: "shared", options: { env: { ...process.env, BOT_STATE_DIR: stateDir } } },
            leaseMs: 300_000,
            waitMs: 0,
          }, async () => process.exit(23));
        `,
      );

      const exitCode = await new Promise<number | null>((resolve, reject) => {
        const child = spawn(process.execPath, ["--import", "tsx", childScript, state.stateDir], {
          stdio: ["ignore", "pipe", "pipe"],
        });
        let output = "";
        child.stdout.on("data", (chunk) => (output += chunk));
        child.stderr.on("data", (chunk) => (output += chunk));
        child.on("error", reject);
        child.on("close", (code) => {
          if (code !== 23) {
            reject(new Error(`lease child exited ${code}: ${output}`));
            return;
          }
          resolve(code);
        });
      });
      expect(exitCode).toBe(23);

      let reacquired = false;
      await withBotStateLease(
        {
          scope: "core:test",
          key: "process-exit",
          database: { scope: "shared", options: { env: state.env } },
          leaseMs: 1_000,
          waitMs: 0,
        },
        async () => {
          reacquired = true;
        },
      );
      expect(reacquired).toBe(true);
    });
  });

  it("rechecks exact ownership inside the caller's write transaction", async () => {
    await withBotTestState({ label: "core-state-lease" }, async () => {
      await expect(
        withBotStateLease(
          {
            scope: "core:test",
            key: "credential-write",
            database: { scope: "shared" },
            leaseMs: 1_000,
            waitMs: 0,
          },
          async (lease) => {
            runBotStateWriteTransaction(({ db }) => {
              lease.assertOwnedInTransaction(db);
              executeSqliteQuerySync(
                db,
                getNodeSqliteKysely<LeaseDatabase>(db)
                  .updateTable("state_leases")
                  .set({ owner: "successor" })
                  .where("scope", "=", "core:test")
                  .where("lease_key", "=", "credential-write"),
              );
              expect(() => lease.assertOwnedInTransaction(db)).toThrowError(
                expect.objectContaining({ code: "BOT_STATE_LEASE_LOST" }),
              );
            });
          },
        ),
      ).rejects.toMatchObject({ code: "BOT_STATE_LEASE_LOST" });
    });
  });
});
