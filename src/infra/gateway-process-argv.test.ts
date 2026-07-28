// Tests gateway process argv parsing for diagnostics.
import { describe, expect, it } from "vitest";
import { isGatewayArgv, isBotCommandArgv, parseProcCmdline } from "./gateway-process-argv.js";

describe("parseProcCmdline", () => {
  it("splits null-delimited argv and trims empty entries", () => {
    expect(parseProcCmdline(" node \0 gateway \0\0 --port \0 18789 \0")).toEqual([
      "node",
      "gateway",
      "--port",
      "18789",
    ]);
  });

  it("keeps non-delimited single arguments and drops whitespace-only entries", () => {
    expect(parseProcCmdline(" gateway ")).toEqual(["gateway"]);
    expect(parseProcCmdline(" \0\t\0 ")).toStrictEqual([]);
  });
});

describe("isGatewayArgv", () => {
  it("requires a gateway token", () => {
    expect(isGatewayArgv(["node", "dist/index.js", "--port", "18789"])).toBe(false);
  });

  it("matches known entrypoints across slash and case variants", () => {
    expect(isGatewayArgv(["NODE", "C:\\Bot\\DIST\\ENTRY.JS", "gateway"])).toBe(true);
    expect(isGatewayArgv(["bun", "/srv/bot/scripts/run-node.mjs", "gateway"])).toBe(true);
    expect(isGatewayArgv(["node", "/srv/hanzoai/bot.mjs", "gateway"])).toBe(true);
    expect(isGatewayArgv(["tsx", "/srv/bot/src/entry.ts", "gateway"])).toBe(true);
    expect(isGatewayArgv(["tsx", "/srv/bot/src/index.ts", "gateway"])).toBe(true);
  });

  it("matches the bot executable but gates the gateway binary behind the opt-in flag", () => {
    expect(isGatewayArgv(["C:\\bin\\bot.cmd", "gateway"])).toBe(true);
    expect(isGatewayArgv(["/usr/local/bin/bot-gateway", "gateway"])).toBe(false);
    expect(isGatewayArgv(["bot-gateway"])).toBe(false);
    expect(
      isGatewayArgv(["/usr/local/bin/bot-gateway", "gateway"], {
        allowGatewayBinary: true,
      }),
    ).toBe(true);
    expect(
      isGatewayArgv(["C:\\bin\\bot-gateway.EXE", "gateway"], {
        allowGatewayBinary: true,
      }),
    ).toBe(true);
    expect(isGatewayArgv(["bot-gateway"], { allowGatewayBinary: true })).toBe(true);
  });

  it("rejects unknown gateway argv even when the token is present", () => {
    expect(isGatewayArgv(["node", "/srv/bot/custom.js", "gateway"])).toBe(false);
    expect(isGatewayArgv(["python", "gateway", "script.py"])).toBe(false);
  });
});

describe("isBotCommandArgv", () => {
  it("matches doctor across source, built, and installed entrypoints", () => {
    expect(isBotCommandArgv(["node", "/srv/hanzoai/bot.mjs", "doctor"], "doctor")).toBe(
      true,
    );
    expect(
      isBotCommandArgv(["NODE", "C:\\Bot\\DIST\\ENTRY.JS", "DOCTOR"], "doctor"),
    ).toBe(true);
    expect(isBotCommandArgv(["C:\\bin\\bot.cmd", "doctor", "--fix"], "doctor")).toBe(
      true,
    );
  });

  it("rejects other Bot commands and unrelated doctor processes", () => {
    expect(isBotCommandArgv(["bot", "gateway"], "doctor")).toBe(false);
    expect(isBotCommandArgv(["python", "doctor", "worker.py"], "doctor")).toBe(false);
  });
});
