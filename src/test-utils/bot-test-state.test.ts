// Tests isolated Bot test-state setup and cleanup behavior.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { loadPersistedAuthProfileStore } from "../agents/auth-profiles/persisted.js";
import {
  closeBotAgentDatabaseByPath,
  openBotAgentDatabase,
} from "../state/bot-agent-db.js";
import {
  closeBotStateDatabaseByPath,
  openBotStateDatabase,
} from "../state/bot-state-db.js";
import { withEnvAsync } from "./env.js";
import { createBotTestState, withBotTestState } from "./bot-test-state.js";

async function expectPathMissing(targetPath: string): Promise<void> {
  try {
    await fs.stat(targetPath);
  } catch (error) {
    expect((error as NodeJS.ErrnoException).code).toBe("ENOENT");
    return;
  }
  throw new Error(`expected missing path: ${targetPath}`);
}

describe("bot test state", () => {
  it("creates an isolated home layout with spawn env and restores process env", async () => {
    const previousHome = process.env.HOME;
    const previousBotHome = process.env.BOT_HOME;
    const previousStateDir = process.env.BOT_STATE_DIR;
    const previousConfigPath = process.env.BOT_CONFIG_PATH;

    const state = await createBotTestState({
      label: "unit",
      scenario: "minimal",
    });

    try {
      expect(state.home).toBe(path.join(state.root, "home"));
      expect(state.stateDir).toBe(path.join(state.home, ".bot"));
      expect(state.configPath).toBe(path.join(state.stateDir, "bot.json"));
      expect(state.workspaceDir).toBe(path.join(state.home, "workspace"));
      expect(state.env.HOME).toBe(state.home);
      expect(state.env.BOT_HOME).toBe(state.home);
      expect(state.env.BOT_STATE_DIR).toBe(state.stateDir);
      expect(state.env.BOT_CONFIG_PATH).toBe(state.configPath);
      expect(process.env.HOME).toBe(state.home);
      expect(process.env.BOT_HOME).toBe(state.home);
      expect(JSON.parse(await fs.readFile(state.configPath, "utf8"))).toStrictEqual({});
    } finally {
      await state.cleanup();
    }

    expect(process.env.HOME).toBe(previousHome);
    expect(process.env.BOT_HOME).toBe(previousBotHome);
    expect(process.env.BOT_STATE_DIR).toBe(previousStateDir);
    expect(process.env.BOT_CONFIG_PATH).toBe(previousConfigPath);
    await expectPathMissing(state.root);
  });

  it("supports state-only layout without overriding HOME", async () => {
    const previousHome = process.env.HOME;

    await withBotTestState(
      {
        layout: "state-only",
        scenario: "empty",
      },
      async (state) => {
        expect(process.env.HOME).toBe(previousHome);
        expect(process.env.BOT_STATE_DIR).toBe(state.stateDir);
        expect(process.env.BOT_CONFIG_PATH).toBe(state.configPath);
        expect(state.env.HOME).toBe(previousHome);
        await expectPathMissing(state.configPath);
      },
    );
  });

  it("clears inherited agent-dir overrides by default", async () => {
    await withEnvAsync({ BOT_AGENT_DIR: "/tmp/outside-bot-agent" }, async () => {
      const state = await createBotTestState({
        layout: "state-only",
      });

      try {
        expect(process.env.BOT_AGENT_DIR).toBeUndefined();
        expect(state.env.BOT_AGENT_DIR).toBeUndefined();
        expect(state.agentDir()).toBe(path.join(state.stateDir, "agents", "main", "agent"));
      } finally {
        await state.cleanup();
      }

      expect(process.env.BOT_AGENT_DIR).toBe("/tmp/outside-bot-agent");
    });
  });

  it("allows explicit agent-dir overrides when a test needs them", async () => {
    await withBotTestState(
      {
        env: {
          BOT_AGENT_DIR: "/tmp/explicit-bot-agent",
        },
      },
      async (state) => {
        expect(process.env.BOT_AGENT_DIR).toBe("/tmp/explicit-bot-agent");
        expect(state.env.BOT_AGENT_DIR).toBe("/tmp/explicit-bot-agent");
      },
    );
  });

  it("can route agent-dir env vars to the isolated main agent store", async () => {
    await withBotTestState(
      {
        agentEnv: "main",
      },
      async (state) => {
        expect(process.env.BOT_AGENT_DIR).toBe(state.agentDir());
        expect(state.env.BOT_AGENT_DIR).toBe(state.agentDir());
      },
    );
  });

  it("writes scenario configs and auth profile stores", async () => {
    await withBotTestState(
      {
        scenario: "update-stable",
      },
      async (state) => {
        expect(JSON.parse(await fs.readFile(state.configPath, "utf8"))).toEqual({
          update: {
            channel: "stable",
          },
          plugins: {},
        });

        const profilePath = await state.writeAuthProfiles({
          version: 1,
          profiles: {
            "openai:test": {
              type: "api_key",
              provider: "openai",
              key: "sk-test",
            },
          },
        });

        expect(profilePath).toBe(path.join(state.agentDir(), "bot-agent.sqlite"));
        const profiles = loadPersistedAuthProfileStore(state.agentDir());
        expect(profiles?.version).toBe(1);
        expect(profiles?.profiles["openai:test"]?.provider).toBe("openai");
      },
    );
  });

  it("closes only fixture-owned databases before restoring env", async () => {
    const previousStateDir = process.env.BOT_STATE_DIR;
    const unrelatedRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "bot-test-state-unrelated-"),
    );
    const unrelatedEnv = {
      ...process.env,
      BOT_STATE_DIR: path.join(unrelatedRoot, "state"),
    };
    const state = await createBotTestState({
      layout: "state-only",
      label: "database-cleanup",
    });
    const fixtureShared = openBotStateDatabase({ env: state.env });
    const fixtureAgent = openBotAgentDatabase({
      agentId: "worker",
      env: state.env,
    });
    const unrelatedShared = openBotStateDatabase({ env: unrelatedEnv });
    const unrelatedAgent = openBotAgentDatabase({
      agentId: "outside",
      env: unrelatedEnv,
    });
    const restoreEnv = state.restoreEnv;
    const rmSpy = vi.spyOn(fs, "rm");
    state.restoreEnv = () => {
      expect(process.env.BOT_STATE_DIR).toBe(state.stateDir);
      expect(fixtureShared.db.isOpen).toBe(false);
      expect(fixtureAgent.db.isOpen).toBe(false);
      expect(unrelatedShared.db.isOpen).toBe(true);
      expect(unrelatedAgent.db.isOpen).toBe(true);
      restoreEnv();
    };

    try {
      await state.cleanup();

      expect(process.env.BOT_STATE_DIR).toBe(previousStateDir);
      expect(rmSpy).toHaveBeenCalledWith(state.root, {
        recursive: true,
        force: true,
        maxRetries: 20,
        retryDelay: 25,
      });
      await expectPathMissing(state.root);
      expect(unrelatedShared.db.isOpen).toBe(true);
      expect(unrelatedAgent.db.isOpen).toBe(true);
    } finally {
      state.restoreEnv = restoreEnv;
      restoreEnv();
      closeBotAgentDatabaseByPath(fixtureAgent.path);
      closeBotAgentDatabaseByPath(unrelatedAgent.path);
      closeBotStateDatabaseByPath(fixtureShared.path);
      closeBotStateDatabaseByPath(unrelatedShared.path);
      rmSpy.mockRestore();
      await fs.rm(state.root, {
        recursive: true,
        force: true,
        maxRetries: 20,
        retryDelay: 25,
      });
      await fs.rm(unrelatedRoot, {
        recursive: true,
        force: true,
        maxRetries: 20,
        retryDelay: 25,
      });
    }
  });

  it("preserves callback failures after closing fixture databases", async () => {
    const callbackError = new Error("fixture callback failed");
    let root = "";
    let shared: ReturnType<typeof openBotStateDatabase> | undefined;
    let agent: ReturnType<typeof openBotAgentDatabase> | undefined;

    await expect(
      withBotTestState({ layout: "state-only", label: "callback-failure" }, async (state) => {
        root = state.root;
        shared = openBotStateDatabase({ env: state.env });
        agent = openBotAgentDatabase({
          agentId: "main",
          env: state.env,
        });
        throw callbackError;
      }),
    ).rejects.toBe(callbackError);

    expect(shared?.db.isOpen).toBe(false);
    expect(agent?.db.isOpen).toBe(false);
    await expectPathMissing(root);
  });

  it("creates upgrade survivor fixture state", async () => {
    await withBotTestState(
      {
        scenario: "upgrade-survivor",
      },
      async (state) => {
        const config = JSON.parse(await fs.readFile(state.configPath, "utf8"));
        expect(config.update?.channel).toBe("stable");
        expect(config.plugins?.enabled).toBe(true);
        expect(config.plugins?.allow).toStrictEqual(["discord", "telegram", "whatsapp", "memory"]);
      },
    );
  });

  it("keeps external-service env scoped to the fixture", async () => {
    const previousPolicy = process.env.BOT_SERVICE_REPAIR_POLICY;

    await withBotTestState(
      {
        scenario: "external-service",
      },
      async (state) => {
        expect(process.env.BOT_SERVICE_REPAIR_POLICY).toBe("external");
        expect(state.env.BOT_SERVICE_REPAIR_POLICY).toBe("external");
      },
    );

    expect(process.env.BOT_SERVICE_REPAIR_POLICY).toBe(previousPolicy);
  });
});
