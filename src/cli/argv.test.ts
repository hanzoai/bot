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
  isRootVersionInvocation,
  shouldMigrateState,
  shouldMigrateStateFromPath,
} from "./argv.js";

describe("argv helpers", () => {
  it.each([
    {
      name: "help flag",
      argv: ["node", "bot", "--help"],
      expected: true,
    },
    {
      name: "version flag",
      argv: ["node", "bot", "-V"],
      expected: true,
    },
    {
      name: "normal command",
      argv: ["node", "bot", "status"],
      expected: false,
    },
    {
      name: "root -v alias",
      argv: ["node", "bot", "-v"],
      expected: true,
    },
    {
      name: "root -v alias with profile",
      argv: ["node", "bot", "--profile", "work", "-v"],
      expected: true,
    },
    {
      name: "root -v alias with log-level",
      argv: ["node", "bot", "--log-level", "debug", "-v"],
      expected: true,
    },
    {
      name: "subcommand -v should not be treated as version",
      argv: ["node", "bot", "acp", "-v"],
      expected: false,
    },
    {
      name: "root -v alias with equals profile",
      argv: ["node", "bot", "--profile=work", "-v"],
      expected: true,
    },
    {
      name: "subcommand path after global root flags should not be treated as version",
      argv: ["node", "bot", "--dev", "skills", "list", "-v"],
      expected: false,
    },
  ])("detects help/version flags: $name", ({ argv, expected }) => {
    expect(hasHelpOrVersion(argv)).toBe(expected);
  });

  it.each([
    {
      name: "root --version",
      argv: ["node", "bot", "--version"],
      expected: true,
    },
    {
      name: "root -V",
      argv: ["node", "bot", "-V"],
      expected: true,
    },
    {
      name: "root -v alias with profile",
      argv: ["node", "bot", "--profile", "work", "-v"],
      expected: true,
    },
    {
      name: "subcommand version flag",
      argv: ["node", "bot", "status", "--version"],
      expected: false,
    },
    {
      name: "unknown root flag with version",
      argv: ["node", "bot", "--unknown", "--version"],
      expected: false,
    },
  ])("detects root-only version invocations: $name", ({ argv, expected }) => {
    expect(isRootVersionInvocation(argv)).toBe(expected);
  });

  it.each([
    {
      name: "single command with trailing flag",
      argv: ["node", "bot", "status", "--json"],
      expected: ["status"],
    },
    {
      name: "two-part command",
      argv: ["node", "bot", "agents", "list"],
      expected: ["agents", "list"],
    },
    {
      name: "terminator cuts parsing",
      argv: ["node", "bot", "status", "--", "ignored"],
      expected: ["status"],
    },
  ])("extracts command path: $name", ({ argv, expected }) => {
    expect(getCommandPath(argv, 2)).toEqual(expected);
  });

  it.each([
    {
      name: "returns first command token",
      argv: ["node", "bot", "agents", "list"],
      expected: "agents",
    },
    {
      name: "returns null when no command exists",
      argv: ["node", "bot"],
      expected: null,
    },
  ])("returns primary command: $name", ({ argv, expected }) => {
    expect(getPrimaryCommand(argv)).toBe(expected);
  });

  it.each([
    {
      name: "detects flag before terminator",
      argv: ["node", "bot", "status", "--json"],
      flag: "--json",
      expected: true,
    },
    {
      name: "ignores flag after terminator",
      argv: ["node", "bot", "--", "--json"],
      flag: "--json",
      expected: false,
    },
  ])("parses boolean flags: $name", ({ argv, flag, expected }) => {
    expect(hasFlag(argv, flag)).toBe(expected);
  });

  it.each([
    {
      name: "value in next token",
      argv: ["node", "bot", "status", "--timeout", "5000"],
      expected: "5000",
    },
    {
      name: "value in equals form",
      argv: ["node", "bot", "status", "--timeout=2500"],
      expected: "2500",
    },
    {
      name: "missing value",
      argv: ["node", "bot", "status", "--timeout"],
      expected: null,
    },
    {
      name: "next token is another flag",
      argv: ["node", "bot", "status", "--timeout", "--json"],
      expected: null,
    },
    {
      name: "flag appears after terminator",
      argv: ["node", "bot", "--", "--timeout=99"],
      expected: undefined,
    },
  ])("extracts flag values: $name", ({ argv, expected }) => {
    expect(getFlagValue(argv, "--timeout")).toBe(expected);
  });

  it("parses verbose flags", () => {
    expect(getVerboseFlag(["node", "bot", "status", "--verbose"])).toBe(true);
    expect(getVerboseFlag(["node", "bot", "status", "--debug"])).toBe(false);
    expect(getVerboseFlag(["node", "bot", "status", "--debug"], { includeDebug: true })).toBe(
      true,
    );
  });

  it.each([
    {
      name: "missing flag",
      argv: ["node", "bot", "status"],
      expected: undefined,
    },
    {
      name: "missing value",
      argv: ["node", "bot", "status", "--timeout"],
      expected: null,
    },
    {
      name: "valid positive integer",
      argv: ["node", "bot", "status", "--timeout", "5000"],
      expected: 5000,
    },
    {
      name: "invalid integer",
      argv: ["node", "bot", "status", "--timeout", "nope"],
      expected: undefined,
    },
  ])("parses positive integer flag values: $name", ({ argv, expected }) => {
    expect(getPositiveIntFlagValue(argv, "--timeout")).toBe(expected);
  });

  it("builds parse argv from raw args", () => {
    const cases = [
      {
        rawArgs: ["node", "bot", "status"],
        expected: ["node", "bot", "status"],
      },
      {
        rawArgs: ["node-22", "bot", "status"],
        expected: ["node-22", "bot", "status"],
      },
      {
        rawArgs: ["node-22.2.0.exe", "bot", "status"],
        expected: ["node-22.2.0.exe", "bot", "status"],
      },
      {
        rawArgs: ["node-22.2", "bot", "status"],
        expected: ["node-22.2", "bot", "status"],
      },
      {
        rawArgs: ["node-22.2.exe", "bot", "status"],
        expected: ["node-22.2.exe", "bot", "status"],
      },
      {
        rawArgs: ["/usr/bin/node-22.2.0", "bot", "status"],
        expected: ["/usr/bin/node-22.2.0", "bot", "status"],
      },
      {
        rawArgs: ["node24", "bot", "status"],
        expected: ["node24", "bot", "status"],
      },
      {
        rawArgs: ["/usr/bin/node24", "bot", "status"],
        expected: ["/usr/bin/node24", "bot", "status"],
      },
      {
        rawArgs: ["node24.exe", "bot", "status"],
        expected: ["node24.exe", "bot", "status"],
      },
      {
        rawArgs: ["nodejs", "bot", "status"],
        expected: ["nodejs", "bot", "status"],
      },
      {
        rawArgs: ["node-dev", "bot", "status"],
        expected: ["node", "bot", "node-dev", "bot", "status"],
      },
      {
        rawArgs: ["bot", "status"],
        expected: ["node", "bot", "status"],
      },
      {
        rawArgs: ["bun", "src/entry.ts", "status"],
        expected: ["bun", "src/entry.ts", "status"],
      },
    ] as const;

    for (const testCase of cases) {
      const parsed = buildParseArgv({
        programName: "bot",
        rawArgs: [...testCase.rawArgs],
      });
      expect(parsed).toEqual([...testCase.expected]);
    }
  });

  it("builds parse argv from fallback args", () => {
    const fallbackArgv = buildParseArgv({
      programName: "bot",
      fallbackArgv: ["status"],
    });
    expect(fallbackArgv).toEqual(["node", "bot", "status"]);
  });

  it("decides when to migrate state", () => {
    const nonMutatingArgv = [
      ["node", "bot", "status"],
      ["node", "bot", "health"],
      ["node", "bot", "sessions"],
      ["node", "bot", "config", "get", "update"],
      ["node", "bot", "config", "unset", "update"],
      ["node", "bot", "models", "list"],
      ["node", "bot", "models", "status"],
      ["node", "bot", "memory", "status"],
      ["node", "bot", "agent", "--message", "hi"],
    ] as const;
    const mutatingArgv = [
      ["node", "bot", "agents", "list"],
      ["node", "bot", "message", "send"],
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
