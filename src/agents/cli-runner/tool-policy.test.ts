import { describe, expect, it } from "vitest";
import {
  buildCliBackendToolAvailability,
  resolveCliRuntimeToolsAllow,
  stripBotMcpToolPrefix,
} from "./tool-policy.js";

describe("buildCliBackendToolAvailability", () => {
  it("keeps canonical names and projects the shipped beta MCP transport names", () => {
    expect(
      buildCliBackendToolAvailability({ native: ["Read"], bot: ["message", "write"] }),
    ).toEqual({
      native: ["Read"],
      bot: ["message", "write"],
      mcp: ["mcp__bot__message", "mcp__bot__write"],
    });
  });
});

describe("stripBotMcpToolPrefix", () => {
  it("strips only the loopback transport prefix", () => {
    expect(stripBotMcpToolPrefix("mcp__bot__memory_search")).toBe("memory_search");
    expect(stripBotMcpToolPrefix("memory_search")).toBe("memory_search");
    expect(stripBotMcpToolPrefix("mcp__other__tool")).toBe("mcp__other__tool");
  });
});

describe("resolveCliRuntimeToolsAllow", () => {
  it("keeps every concrete restriction, including server-managed defaults", () => {
    expect(resolveCliRuntimeToolsAllow(undefined)).toBeUndefined();
    expect(resolveCliRuntimeToolsAllow(["memory_search"], true)).toEqual(["memory_search"]);
    expect(resolveCliRuntimeToolsAllow(["*"])).toBeUndefined();
    expect(resolveCliRuntimeToolsAllow(["memory_search"])).toEqual(["memory_search"]);
  });
});
