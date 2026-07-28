// Tests Bot execution environment construction.
import { describe, expect, it } from "vitest";
import { deleteTestEnvValue, setTestEnvValue } from "../test-utils/env.js";
import {
  ensureBotExecMarkerOnProcess,
  markBotExecEnv,
  BOT_CLI_ENV_VAR,
} from "./bot-exec-env.js";

const BOT_CLI_ENV_VALUE = "1";

describe("markBotExecEnv", () => {
  it("returns a cloned env object with the exec marker set", () => {
    const env = { PATH: "/usr/bin", BOT_CLI: "0" };
    const marked = markBotExecEnv(env);

    expect(marked).toEqual({
      PATH: "/usr/bin",
      BOT_CLI: BOT_CLI_ENV_VALUE,
    });
    expect(marked).not.toBe(env);
    expect(env.BOT_CLI).toBe("0");
  });
});

describe("ensureBotExecMarkerOnProcess", () => {
  it.each([
    {
      name: "mutates and returns the provided process env",
      env: { PATH: "/usr/bin" } as NodeJS.ProcessEnv,
    },
    {
      name: "overwrites an existing marker on the provided process env",
      env: { PATH: "/usr/bin", [BOT_CLI_ENV_VAR]: "0" } as NodeJS.ProcessEnv,
    },
  ])("$name", ({ env }) => {
    expect(ensureBotExecMarkerOnProcess(env)).toBe(env);
    expect(env[BOT_CLI_ENV_VAR]).toBe(BOT_CLI_ENV_VALUE);
  });

  it("defaults to mutating process.env when no env object is provided", () => {
    const previous = process.env[BOT_CLI_ENV_VAR];
    deleteTestEnvValue(BOT_CLI_ENV_VAR);

    try {
      expect(ensureBotExecMarkerOnProcess()).toBe(process.env);
      expect(process.env[BOT_CLI_ENV_VAR]).toBe(BOT_CLI_ENV_VALUE);
    } finally {
      if (previous === undefined) {
        deleteTestEnvValue(BOT_CLI_ENV_VAR);
      } else {
        setTestEnvValue(BOT_CLI_ENV_VAR, previous);
      }
    }
  });
});
