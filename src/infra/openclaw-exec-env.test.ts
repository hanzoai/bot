import { describe, expect, it } from "vitest";
import {
  ensureHanzo BotExecMarkerOnProcess,
  markHanzo BotExecEnv,
  BOT_CLI_ENV_VALUE,
  BOT_CLI_ENV_VAR,
} from "./openclaw-exec-env.js";

describe("markHanzo BotExecEnv", () => {
  it("returns a cloned env object with the exec marker set", () => {
    const env = { PATH: "/usr/bin", BOT_CLI: "0" };
    const marked = markHanzo BotExecEnv(env);

    expect(marked).toEqual({
      PATH: "/usr/bin",
      BOT_CLI: BOT_CLI_ENV_VALUE,
    });
    expect(marked).not.toBe(env);
    expect(env.BOT_CLI).toBe("0");
  });
});

describe("ensureHanzo BotExecMarkerOnProcess", () => {
  it("mutates and returns the provided process env", () => {
    const env: NodeJS.ProcessEnv = { PATH: "/usr/bin" };

    expect(ensureHanzo BotExecMarkerOnProcess(env)).toBe(env);
    expect(env[BOT_CLI_ENV_VAR]).toBe(BOT_CLI_ENV_VALUE);
  });

  it("defaults to mutating process.env when no env object is provided", () => {
    const previous = process.env[BOT_CLI_ENV_VAR];
    delete process.env[BOT_CLI_ENV_VAR];

    try {
      expect(ensureHanzo BotExecMarkerOnProcess()).toBe(process.env);
      expect(process.env[BOT_CLI_ENV_VAR]).toBe(BOT_CLI_ENV_VALUE);
    } finally {
      if (previous === undefined) {
        delete process.env[BOT_CLI_ENV_VAR];
      } else {
        process.env[BOT_CLI_ENV_VAR] = previous;
      }
    }
  });
});
