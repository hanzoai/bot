import { describe, expect, it } from "vitest";
import {
  buildParseArgv,
  getFlagValue,
  getCommandPath,
  getPrimaryCommand,
  getPositiveIntFlagValue,
  getVerboseFlag,
  hasHelpOrVersion,
  hasFlag,
  shouldMigrateState,
  shouldMigrateStateFromPath,
} from "./argv.js";

describe("argv helpers", () => {
  it.each([
    {
      name: "help flag",
      argv: ["node", "hanzo-bot", "--help"],
      expected: true,
    },
    {
      name: "version flag",
      argv: ["node", "hanzo-bot", "-V"],
      expected: true,
    },
    {
      name: "normal command",
      argv: ["node", "hanzo-bot", "status"],
      expected: false,
    },
    {
      name: "root -v alias",
      argv: ["node", "hanzo-bot", "-v"],
      expected: true,
    },
    {
      name: "root -v alias with profile",
      argv: ["node", "hanzo-bot", "--profile", "work", "-v"],
      expected: true,
    },
    {
      name: "root -v alias with log-level",
      argv: ["node", "hanzo-bot", "--log-level", "debug", "-v"],
      expected: true,
    },
    {
      name: "subcommand -v should not be treated as version",
      argv: ["node", "hanzo-bot", "acp", "-v"],
      expected: false,
    },
    {
      name: "root -v alias with equals profile",
      argv: ["node", "hanzo-bot", "--profile=work", "-v"],
      expected: true,
    },
    {
      name: "subcommand path after global root flags should not be treated as version",
      argv: ["node", "hanzo-bot", "--dev", "skills", "list", "-v"],
      expected: false,
    },
  ])("detects help/version flags: $name", ({ argv, expected }) => {
    expect(hasHelpOrVersion(argv)).toBe(expected);
  });

  it.each([
    {
      name: "single command with trailing flag",
      argv: ["node", "hanzo-bot", "status", "--json"],
      expected: ["status"],
    },
    {
      name: "two-part command",
      argv: ["node", "hanzo-bot", "agents", "list"],
      expected: ["agents", "list"],
    },
    {
      name: "terminator cuts parsing",
      argv: ["node", "hanzo-bot", "status", "--", "ignored"],
      expected: ["status"],
    },
  ])("extracts command path: $name", ({ argv, expected }) => {
    expect(getCommandPath(argv, 2)).toEqual(expected);
  });

  it.each([
    {
      name: "returns first command token",
      argv: ["node", "hanzo-bot", "agents", "list"],
      expected: "agents",
    },
    {
      name: "returns null when no command exists",
      argv: ["node", "hanzo-bot"],
      expected: null,
    },
  ])("returns primary command: $name", ({ argv, expected }) => {
    expect(getPrimaryCommand(argv)).toBe(expected);
  });

  it.each([
    {
      name: "detects flag before terminator",
      argv: ["node", "hanzo-bot", "status", "--json"],
      flag: "--json",
      expected: true,
    },
    {
      name: "ignores flag after terminator",
      argv: ["node", "hanzo-bot", "--", "--json"],
      flag: "--json",
      expected: false,
    },
  ])("parses boolean flags: $name", ({ argv, flag, expected }) => {
    expect(hasFlag(argv, flag)).toBe(expected);
  });

  it.each([
    {
      name: "value in next token",
      argv: ["node", "hanzo-bot", "status", "--timeout", "5000"],
      expected: "5000",
    },
    {
      name: "value in equals form",
      argv: ["node", "hanzo-bot", "status", "--timeout=2500"],
      expected: "2500",
    },
    {
      name: "missing value",
      argv: ["node", "hanzo-bot", "status", "--timeout"],
      expected: null,
    },
    {
      name: "next token is another flag",
      argv: ["node", "hanzo-bot", "status", "--timeout", "--json"],
      expected: null,
    },
    {
      name: "flag appears after terminator",
      argv: ["node", "hanzo-bot", "--", "--timeout=99"],
      expected: undefined,
    },
  ])("extracts flag values: $name", ({ argv, expected }) => {
    expect(getFlagValue(argv, "--timeout")).toBe(expected);
  });

  it("parses verbose flags", () => {
    expect(getVerboseFlag(["node", "hanzo-bot", "status", "--verbose"])).toBe(true);
    expect(getVerboseFlag(["node", "hanzo-bot", "status", "--debug"])).toBe(false);
    expect(getVerboseFlag(["node", "hanzo-bot", "status", "--debug"], { includeDebug: true })).toBe(
      true,
    );
  });

  it.each([
    {
      name: "missing flag",
      argv: ["node", "hanzo-bot", "status"],
      expected: undefined,
    },
    {
      name: "missing value",
      argv: ["node", "hanzo-bot", "status", "--timeout"],
      expected: null,
    },
    {
      name: "valid positive integer",
      argv: ["node", "hanzo-bot", "status", "--timeout", "5000"],
      expected: 5000,
    },
    {
      name: "invalid integer",
      argv: ["node", "hanzo-bot", "status", "--timeout", "nope"],
      expected: undefined,
    },
  ])("parses positive integer flag values: $name", ({ argv, expected }) => {
    expect(getPositiveIntFlagValue(argv, "--timeout")).toBe(expected);
  });

  it("builds parse argv from raw args", () => {
    const cases = [
      {
        rawArgs: ["node", "hanzo-bot", "status"],
        expected: ["node", "hanzo-bot", "status"],
      },
      {
        rawArgs: ["node-22", "hanzo-bot", "status"],
        expected: ["node-22", "hanzo-bot", "status"],
      },
      {
        rawArgs: ["node-22.2.0.exe", "hanzo-bot", "status"],
        expected: ["node-22.2.0.exe", "hanzo-bot", "status"],
      },
      {
        rawArgs: ["node-22.2", "hanzo-bot", "status"],
        expected: ["node-22.2", "hanzo-bot", "status"],
      },
      {
        rawArgs: ["node-22.2.exe", "hanzo-bot", "status"],
        expected: ["node-22.2.exe", "hanzo-bot", "status"],
      },
      {
        rawArgs: ["/usr/bin/node-22.2.0", "hanzo-bot", "status"],
        expected: ["/usr/bin/node-22.2.0", "hanzo-bot", "status"],
      },
      {
        rawArgs: ["node24", "hanzo-bot", "status"],
        expected: ["node24", "hanzo-bot", "status"],
      },
      {
        rawArgs: ["/usr/bin/node24", "hanzo-bot", "status"],
        expected: ["/usr/bin/node24", "hanzo-bot", "status"],
      },
      {
        rawArgs: ["node24.exe", "hanzo-bot", "status"],
        expected: ["node24.exe", "hanzo-bot", "status"],
      },
      {
        rawArgs: ["nodejs", "hanzo-bot", "status"],
        expected: ["nodejs", "hanzo-bot", "status"],
      },
      {
        rawArgs: ["node-dev", "hanzo-bot", "status"],
        expected: ["node", "hanzo-bot", "node-dev", "hanzo-bot", "status"],
      },
      {
        rawArgs: ["hanzo-bot", "status"],
        expected: ["node", "hanzo-bot", "status"],
      },
      {
        rawArgs: ["bun", "src/entry.ts", "status"],
        expected: ["bun", "src/entry.ts", "status"],
      },
    ] as const;

    for (const testCase of cases) {
      const parsed = buildParseArgv({
        programName: "hanzo-bot",
        rawArgs: [...testCase.rawArgs],
      });
      expect(parsed).toEqual([...testCase.expected]);
    }
  });

  it("builds parse argv from fallback args", () => {
    const fallbackArgv = buildParseArgv({
      programName: "hanzo-bot",
      fallbackArgv: ["status"],
    });
    expect(fallbackArgv).toEqual(["node", "hanzo-bot", "status"]);
  });

  it("decides when to migrate state", () => {
    const nonMutatingArgv = [
      ["node", "hanzo-bot", "status"],
      ["node", "hanzo-bot", "health"],
      ["node", "hanzo-bot", "sessions"],
      ["node", "hanzo-bot", "config", "get", "update"],
      ["node", "hanzo-bot", "config", "unset", "update"],
      ["node", "hanzo-bot", "models", "list"],
      ["node", "hanzo-bot", "models", "status"],
      ["node", "hanzo-bot", "memory", "status"],
      ["node", "hanzo-bot", "agent", "--message", "hi"],
    ] as const;
    const mutatingArgv = [
      ["node", "hanzo-bot", "agents", "list"],
      ["node", "hanzo-bot", "message", "send"],
    ] as const;

    for (const argv of nonMutatingArgv) {
      expect(shouldMigrateState([...argv])).toBe(false);
    }
    for (const argv of mutatingArgv) {
      expect(shouldMigrateState([...argv])).toBe(true);
    }
  });

  it.each([
    { path: ["status"], expected: false },
    { path: ["config", "get"], expected: false },
    { path: ["models", "status"], expected: false },
    { path: ["agents", "list"], expected: true },
  ])("reuses command path for migrate state decisions: $path", ({ path, expected }) => {
    expect(shouldMigrateStateFromPath(path)).toBe(expected);
  });
});
