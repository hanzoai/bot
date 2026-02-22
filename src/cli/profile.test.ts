import path from "node:path";
import { describe, expect, it } from "vitest";
import { formatCliCommand } from "./command-format.js";
import { applyCliProfileEnv, parseCliProfileArgs } from "./profile.js";

describe("parseCliProfileArgs", () => {
  it("leaves gateway --dev for subcommands", () => {
    const res = parseCliProfileArgs(["node", "bot", "gateway", "--dev", "--allow-unconfigured"]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBeNull();
    expect(res.argv).toEqual(["node", "bot", "gateway", "--dev", "--allow-unconfigured"]);
  });

  it("still accepts global --dev before subcommand", () => {
    const res = parseCliProfileArgs(["node", "bot", "--dev", "gateway"]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBe("dev");
    expect(res.argv).toEqual(["node", "bot", "gateway"]);
  });

  it("parses --profile value and strips it", () => {
    const res = parseCliProfileArgs(["node", "bot", "--profile", "work", "status"]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBe("work");
    expect(res.argv).toEqual(["node", "bot", "status"]);
  });

  it("rejects missing profile value", () => {
    const res = parseCliProfileArgs(["node", "bot", "--profile"]);
    expect(res.ok).toBe(false);
  });

  it("rejects combining --dev with --profile (dev first)", () => {
    const res = parseCliProfileArgs(["node", "bot", "--dev", "--profile", "work", "status"]);
    expect(res.ok).toBe(false);
  });

  it("rejects combining --dev with --profile (profile first)", () => {
    const res = parseCliProfileArgs(["node", "bot", "--profile", "work", "--dev", "status"]);
    expect(res.ok).toBe(false);
  });
});

describe("applyCliProfileEnv", () => {
  it("fills env defaults for dev profile", () => {
    const env: Record<string, string | undefined> = {};
    applyCliProfileEnv({
      profile: "dev",
      env,
      homedir: () => "/home/peter",
    });
    const expectedStateDir = path.join(path.resolve("/home/peter"), ".bot-dev");
    expect(env.BOT_PROFILE).toBe("dev");
    expect(env.BOT_STATE_DIR).toBe(expectedStateDir);
    expect(env.BOT_CONFIG_PATH).toBe(path.join(expectedStateDir, "bot.json"));
    expect(env.BOT_GATEWAY_PORT).toBe("19001");
  });

  it("does not override explicit env values", () => {
    const env: Record<string, string | undefined> = {
      BOT_STATE_DIR: "/custom",
      BOT_GATEWAY_PORT: "19099",
    };
    applyCliProfileEnv({
      profile: "dev",
      env,
      homedir: () => "/home/peter",
    });
    expect(env.BOT_STATE_DIR).toBe("/custom");
    expect(env.BOT_GATEWAY_PORT).toBe("19099");
    expect(env.BOT_CONFIG_PATH).toBe(path.join("/custom", "bot.json"));
  });

  it("uses BOT_HOME when deriving profile state dir", () => {
    const env: Record<string, string | undefined> = {
      BOT_HOME: "/srv/bot-home",
      HOME: "/home/other",
    };
    applyCliProfileEnv({
      profile: "work",
      env,
      homedir: () => "/home/fallback",
    });

    const resolvedHome = path.resolve("/srv/bot-home");
    expect(env.BOT_STATE_DIR).toBe(path.join(resolvedHome, ".bot-work"));
    expect(env.BOT_CONFIG_PATH).toBe(path.join(resolvedHome, ".bot-work", "bot.json"));
  });
});

describe("formatCliCommand", () => {
  it("returns command unchanged when no profile is set", () => {
    expect(formatCliCommand("hanzo-bot doctor --fix", {})).toBe("hanzo-bot doctor --fix");
  });

  it("returns command unchanged when profile is default", () => {
    expect(formatCliCommand("hanzo-bot doctor --fix", { BOT_PROFILE: "default" })).toBe(
      "hanzo-bot doctor --fix",
    );
  });

  it("returns command unchanged when profile is Default (case-insensitive)", () => {
    expect(formatCliCommand("hanzo-bot doctor --fix", { BOT_PROFILE: "Default" })).toBe(
      "hanzo-bot doctor --fix",
    );
  });

  it("returns command unchanged when profile is invalid", () => {
    expect(formatCliCommand("hanzo-bot doctor --fix", { BOT_PROFILE: "bad profile" })).toBe(
      "hanzo-bot doctor --fix",
    );
  });

  it("returns command unchanged when --profile is already present", () => {
    expect(formatCliCommand("hanzo-bot --profile work doctor --fix", { BOT_PROFILE: "work" })).toBe(
      "hanzo-bot --profile work doctor --fix",
    );
  });

  it("returns command unchanged when --dev is already present", () => {
    expect(formatCliCommand("hanzo-bot --dev doctor", { BOT_PROFILE: "dev" })).toBe(
      "hanzo-bot --dev doctor",
    );
  });

  it("inserts --profile flag when profile is set", () => {
    expect(formatCliCommand("hanzo-bot doctor --fix", { BOT_PROFILE: "work" })).toBe(
      "hanzo-bot --profile work doctor --fix",
    );
  });

  it("trims whitespace from profile", () => {
    expect(formatCliCommand("hanzo-bot doctor --fix", { BOT_PROFILE: "  jbhanzo-bot  " })).toBe(
      "hanzo-bot --profile jbhanzo-bot doctor --fix",
    );
  });

  it("handles command with no args after bot", () => {
    expect(formatCliCommand("bot", { BOT_PROFILE: "test" })).toBe("hanzo-bot --profile test");
  });

  it("handles pnpm wrapper", () => {
    expect(formatCliCommand("pnpm hanzo-bot doctor", { BOT_PROFILE: "work" })).toBe(
      "pnpm hanzo-bot --profile work doctor",
    );
  });
});
