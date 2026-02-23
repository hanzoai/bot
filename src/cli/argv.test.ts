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
  it("detects help/version flags", () => {
    expect(hasHelpOrVersion(["node", "bot", "--help"])).toBe(true);
    expect(hasHelpOrVersion(["node", "bot", "-V"])).toBe(true);
    expect(hasHelpOrVersion(["node", "bot", "status"])).toBe(false);
  });

  it("extracts command path ignoring flags and terminator", () => {
    expect(getCommandPath(["node", "bot", "status", "--json"], 2)).toEqual(["status"]);
    expect(getCommandPath(["node", "bot", "agents", "list"], 2)).toEqual(["agents", "list"]);
    expect(getCommandPath(["node", "bot", "status", "--", "ignored"], 2)).toEqual(["status"]);
  });

  it("returns primary command", () => {
    expect(getPrimaryCommand(["node", "bot", "agents", "list"])).toBe("agents");
    expect(getPrimaryCommand(["node", "bot"])).toBeNull();
  });

  it("parses boolean flags and ignores terminator", () => {
    expect(hasFlag(["node", "bot", "status", "--json"], "--json")).toBe(true);
    expect(hasFlag(["node", "bot", "--", "--json"], "--json")).toBe(false);
  });

  it("extracts flag values with equals and missing values", () => {
    expect(getFlagValue(["node", "bot", "status", "--timeout", "5000"], "--timeout")).toBe("5000");
    expect(getFlagValue(["node", "bot", "status", "--timeout=2500"], "--timeout")).toBe("2500");
    expect(getFlagValue(["node", "bot", "status", "--timeout"], "--timeout")).toBeNull();
    expect(getFlagValue(["node", "bot", "status", "--timeout", "--json"], "--timeout")).toBe(null);
    expect(getFlagValue(["node", "bot", "--", "--timeout=99"], "--timeout")).toBeUndefined();
  });

  it("parses verbose flags", () => {
    expect(getVerboseFlag(["node", "bot", "status", "--verbose"])).toBe(true);
    expect(getVerboseFlag(["node", "bot", "status", "--debug"])).toBe(false);
    expect(getVerboseFlag(["node", "bot", "status", "--debug"], { includeDebug: true })).toBe(true);
  });

  it("parses positive integer flag values", () => {
    expect(getPositiveIntFlagValue(["node", "bot", "status"], "--timeout")).toBeUndefined();
    expect(getPositiveIntFlagValue(["node", "bot", "status", "--timeout"], "--timeout")).toBeNull();
    expect(
      getPositiveIntFlagValue(["node", "bot", "status", "--timeout", "5000"], "--timeout"),
    ).toBe(5000);
    expect(
      getPositiveIntFlagValue(["node", "bot", "status", "--timeout", "nope"], "--timeout"),
    ).toBeUndefined();
  });

  it("builds parse argv from raw args", () => {
    const nodeArgv = buildParseArgv({
      programName: "bot",
      rawArgs: ["node", "bot", "status"],
    });
    expect(nodeArgv).toEqual(["node", "bot", "status"]);

    const versionedNodeArgv = buildParseArgv({
      programName: "bot",
      rawArgs: ["node-22", "bot", "status"],
    });
    expect(versionedNodeArgv).toEqual(["node-22", "bot", "status"]);

    const versionedNodeWindowsArgv = buildParseArgv({
      programName: "bot",
      rawArgs: ["node-22.2.0.exe", "bot", "status"],
    });
    expect(versionedNodeWindowsArgv).toEqual(["node-22.2.0.exe", "bot", "status"]);

    const versionedNodePatchlessArgv = buildParseArgv({
      programName: "bot",
      rawArgs: ["node-22.2", "bot", "status"],
    });
    expect(versionedNodePatchlessArgv).toEqual(["node-22.2", "bot", "status"]);

    const versionedNodeWindowsPatchlessArgv = buildParseArgv({
      programName: "bot",
      rawArgs: ["node-22.2.exe", "bot", "status"],
    });
    expect(versionedNodeWindowsPatchlessArgv).toEqual(["node-22.2.exe", "bot", "status"]);

    const versionedNodeWithPathArgv = buildParseArgv({
      programName: "bot",
      rawArgs: ["/usr/bin/node-22.2.0", "bot", "status"],
    });
    expect(versionedNodeWithPathArgv).toEqual(["/usr/bin/node-22.2.0", "bot", "status"]);

    const nodejsArgv = buildParseArgv({
      programName: "bot",
      rawArgs: ["nodejs", "bot", "status"],
    });
    expect(nodejsArgv).toEqual(["nodejs", "bot", "status"]);

    const nonVersionedNodeArgv = buildParseArgv({
      programName: "bot",
      rawArgs: ["node-dev", "bot", "status"],
    });
    expect(nonVersionedNodeArgv).toEqual(["node", "bot", "node-dev", "bot", "status"]);

    const directArgv = buildParseArgv({
      programName: "bot",
      rawArgs: ["bot", "status"],
    });
    expect(directArgv).toEqual(["node", "bot", "status"]);

    const bunArgv = buildParseArgv({
      programName: "bot",
      rawArgs: ["bun", "src/entry.ts", "status"],
    });
    expect(bunArgv).toEqual(["bun", "src/entry.ts", "status"]);
  });

  it("builds parse argv from fallback args", () => {
    const fallbackArgv = buildParseArgv({
      programName: "bot",
      fallbackArgv: ["status"],
    });
    expect(fallbackArgv).toEqual(["node", "bot", "status"]);
  });

  it("decides when to migrate state", () => {
    expect(shouldMigrateState(["node", "bot", "status"])).toBe(false);
    expect(shouldMigrateState(["node", "bot", "health"])).toBe(false);
    expect(shouldMigrateState(["node", "bot", "sessions"])).toBe(false);
    expect(shouldMigrateState(["node", "bot", "config", "get", "update"])).toBe(false);
    expect(shouldMigrateState(["node", "bot", "config", "unset", "update"])).toBe(false);
    expect(shouldMigrateState(["node", "bot", "models", "list"])).toBe(false);
    expect(shouldMigrateState(["node", "bot", "models", "status"])).toBe(false);
    expect(shouldMigrateState(["node", "bot", "memory", "status"])).toBe(false);
    expect(shouldMigrateState(["node", "bot", "agent", "--message", "hi"])).toBe(false);
    expect(shouldMigrateState(["node", "bot", "agents", "list"])).toBe(true);
    expect(shouldMigrateState(["node", "bot", "message", "send"])).toBe(true);
  });

  it("reuses command path for migrate state decisions", () => {
    expect(shouldMigrateStateFromPath(["status"])).toBe(false);
    expect(shouldMigrateStateFromPath(["config", "get"])).toBe(false);
    expect(shouldMigrateStateFromPath(["models", "status"])).toBe(false);
    expect(shouldMigrateStateFromPath(["agents", "list"])).toBe(true);
  });
});
