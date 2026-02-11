import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveGatewayStateDir } from "./paths.js";

describe("resolveGatewayStateDir", () => {
  it("uses the default state dir when no overrides are set", () => {
    const env = { HOME: "/Users/test" };
    expect(resolveGatewayStateDir(env)).toBe(path.join("/Users/test", ".bot"));
  });

  it("appends the profile suffix when set", () => {
    const env = { HOME: "/Users/test", BOT_PROFILE: "rescue" };
    expect(resolveGatewayStateDir(env)).toBe(path.join("/Users/test", ".bot-rescue"));
  });

  it("treats default profiles as the base state dir", () => {
    const env = { HOME: "/Users/test", BOT_PROFILE: "Default" };
    expect(resolveGatewayStateDir(env)).toBe(path.join("/Users/test", ".bot"));
  });

  it("uses BOT_STATE_DIR when provided", () => {
    const env = { HOME: "/Users/test", BOT_STATE_DIR: "/var/lib/bot" };
    expect(resolveGatewayStateDir(env)).toBe(path.resolve("/var/lib/bot"));
  });

  it("expands ~ in BOT_STATE_DIR", () => {
    const env = { HOME: "/Users/test", BOT_STATE_DIR: "~/bot-state" };
    expect(resolveGatewayStateDir(env)).toBe(path.resolve("/Users/test/bot-state"));
  });

  it("preserves Windows absolute paths without HOME", () => {
    const env = { BOT_STATE_DIR: "C:\\State\\bot" };
    expect(resolveGatewayStateDir(env)).toBe("C:\\State\\bot");
  });
});
