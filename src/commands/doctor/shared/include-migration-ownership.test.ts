import { describe, expect, it } from "vitest";
import type { BotConfig } from "../../../config/types.bot.js";
import { isSingleTopLevelIncludeMigration } from "./include-migration-ownership.js";

const sourceConfig = {
  mcp: { servers: { local: { command: "node", disabled: true } } },
} as unknown as BotConfig;
const candidate = {
  mcp: { servers: { local: { command: "node", enabled: false } } },
} as BotConfig;

describe("include migration ownership", () => {
  it("allows one isolated direct top-level string include", () => {
    expect(
      isSingleTopLevelIncludeMigration({
        parsed: { mcp: { $include: "./mcp.json5" } },
        sourceConfig,
        candidate,
      }),
    ).toBe(true);
  });

  it.each([
    ["root include", { $include: "./bot.json5" }],
    ["include array", { mcp: { $include: ["./a.json5", "./b.json5"] } }],
    ["nested include", { mcp: { servers: { $include: "./servers.json5" } } }],
    ["sibling override", { mcp: { $include: "./mcp.json5", sessionIdleTtlMs: 1000 } }],
  ])("rejects %s ownership", (_label, parsed) => {
    expect(isSingleTopLevelIncludeMigration({ parsed, sourceConfig, candidate })).toBe(false);
  });

  it("rejects migrations that change more than one top-level section", () => {
    expect(
      isSingleTopLevelIncludeMigration({
        parsed: { mcp: { $include: "./mcp.json5" }, gateway: { mode: "local" } },
        sourceConfig: { ...sourceConfig, gateway: { mode: "local" } },
        candidate: { ...candidate, gateway: { mode: "remote" } },
      }),
    ).toBe(false);
  });
});
