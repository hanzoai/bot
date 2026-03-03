import { beforeEach, describe, expect, it, vi } from "vitest";
import { findRoutedCommand } from "./routes.js";

const runConfigGetMock = vi.hoisted(() => vi.fn(async () => {}));
const runConfigUnsetMock = vi.hoisted(() => vi.fn(async () => {}));
const modelsListCommandMock = vi.hoisted(() => vi.fn(async () => {}));
const modelsStatusCommandMock = vi.hoisted(() => vi.fn(async () => {}));

vi.mock("../config-cli.js", () => ({
  runConfigGet: runConfigGetMock,
  runConfigUnset: runConfigUnsetMock,
}));

vi.mock("../../commands/models.js", () => ({
  modelsListCommand: modelsListCommandMock,
  modelsStatusCommand: modelsStatusCommandMock,
}));

describe("program routes", () => {
  it("matches status route and preserves plugin loading", () => {
    const route = findRoutedCommand(["status"]);
    expect(route).not.toBeNull();
    expect(route?.loadPlugins).toBe(true);
  });

  it("matches health route and preloads plugins only for text output", () => {
    const route = expectRoute(["health"]);
    expect(typeof route?.loadPlugins).toBe("function");
    const shouldLoad = route?.loadPlugins as (argv: string[]) => boolean;
    expect(shouldLoad(["node", "@hanzo/bot", "health"])).toBe(true);
    expect(shouldLoad(["node", "@hanzo/bot", "health", "--json"])).toBe(false);
  });

  it("returns false when status timeout flag value is missing", async () => {
    const route = findRoutedCommand(["status"]);
    expect(route).not.toBeNull();
    await expect(route?.run(["node", "bot", "status", "--timeout"])).resolves.toBe(false);
  });

  it("returns false for sessions route when --store value is missing", async () => {
    const route = findRoutedCommand(["sessions"]);
    expect(route).not.toBeNull();
    await expect(route?.run(["node", "bot", "sessions", "--store"])).resolves.toBe(false);
  });

  it("does not match unknown routes", () => {
    expect(findRoutedCommand(["definitely-not-real"])).toBeNull();
  });

  it("returns false for config get route when path argument is missing", async () => {
    const route = findRoutedCommand(["config", "get"]);
    expect(route).not.toBeNull();
    await expect(route?.run(["node", "bot", "config", "get", "--json"])).resolves.toBe(false);
  });

  it("returns false for config unset route when path argument is missing", async () => {
    const route = findRoutedCommand(["config", "unset"]);
    expect(route).not.toBeNull();
    await expect(route?.run(["node", "bot", "config", "unset"])).resolves.toBe(false);
  });
});
