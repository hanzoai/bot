import { describe, expect, it } from "vitest";
import {
  ensureHanzoBotExecMarkerOnProcess,
  markHanzoBotExecEnv,
  BOT_CLI_ENV_VALUE,
  BOT_CLI_ENV_VAR,
} from "./openclaw-exec-env.js";

describe("markHanzoBotExecEnv", () => {
  it("returns a cloned env object with the exec marker set", () => {
    const env = { PATH: "/usr/bin", BOT_CLI: "0" };
    const marked = markHanzoBotExecEnv(env);

    expect(marked).toEqual({
      PATH: "/usr/bin",
      BOT_CLI: BOT_CLI_ENV_VALUE,
    });
    expect(marked).not.toBe(env);
    expect(env.BOT_CLI).toBe("0");
  });
});

describe("ensureHanzoBotExecMarkerOnProcess", () => {
  it("mutates and returns the provided process env", () => {
    const env: NodeJS.ProcessEnv = { PATH: "/usr/bin" };

    expect(ensureHanzoBotExecMarkerOnProcess(env)).toBe(env);
    expect(env[BOT_CLI_ENV_VAR]).toBe(BOT_CLI_ENV_VALUE);
  });

  it("defaults to mutating process.env when no env object is provided", () => {
    const previous = process.env[BOT_CLI_ENV_VAR];
    delete process.env[BOT_CLI_ENV_VAR];

    try {
      expect(ensureHanzoBotExecMarkerOnProcess()).toBe(process.env);
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
