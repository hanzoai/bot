import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveStorePath } from "./paths.js";

describe("resolveStorePath", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses BOT_HOME for tilde expansion", () => {
    vi.stubEnv("BOT_HOME", "/srv/bot-home");
    vi.stubEnv("HOME", "/home/other");

    const resolved = resolveStorePath("~/.bot/agents/{agentId}/sessions/sessions.json", {
      agentId: "research",
    });

    expect(resolved).toBe(
      path.resolve("/srv/bot-home/.bot/agents/research/sessions/sessions.json"),
    );
  });
});
