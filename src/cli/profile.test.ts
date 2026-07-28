// Profile CLI tests cover profile selection, persistence, and command wiring.
import path from "node:path";
import { describe, expect, it } from "vitest";
import { formatCliCommand } from "./command-format.js";
import { applyCliProfileEnv, parseCliProfileArgs } from "./profile.js";

describe("parseCliProfileArgs", () => {
  it("leaves gateway --dev for subcommands", () => {
    const res = parseCliProfileArgs([
      "node",
      "bot",
      "gateway",
      "--dev",
      "--allow-unconfigured",
    ]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBeNull();
    expect(res.argv).toEqual(["node", "bot", "gateway", "--dev", "--allow-unconfigured"]);
  });

  it("leaves gateway --dev for subcommands after leading root options", () => {
    const res = parseCliProfileArgs([
      "node",
      "bot",
      "--no-color",
      "gateway",
      "--dev",
      "--allow-unconfigured",
    ]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBeNull();
    expect(res.argv).toEqual([
      "node",
      "bot",
      "--no-color",
      "gateway",
      "--dev",
      "--allow-unconfigured",
    ]);
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

  it("parses interleaved --profile after the command token", () => {
    const res = parseCliProfileArgs(["node", "bot", "status", "--profile", "work", "--deep"]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBe("work");
    expect(res.argv).toEqual(["node", "bot", "status", "--deep"]);
  });

  it("preserves Matrix QA --profile for the command parser", () => {
    const res = parseCliProfileArgs([
      "node",
      "bot",
      "qa",
      "matrix",
      "--profile",
      "fast",
      "--fail-fast",
    ]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBeNull();
    expect(res.argv).toEqual([
      "node",
      "bot",
      "qa",
      "matrix",
      "--profile",
      "fast",
      "--fail-fast",
    ]);
  });

  it("preserves Matrix QA --profile after leading root options", () => {
    const res = parseCliProfileArgs([
      "node",
      "bot",
      "--no-color",
      "qa",
      "matrix",
      "--profile=fast",
    ]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBeNull();
    expect(res.argv).toEqual(["node", "bot", "--no-color", "qa", "matrix", "--profile=fast"]);
  });

  it("parses qa run --profile smoke-ci as a root profile", () => {
    const res = parseCliProfileArgs([
      "node",
      "bot",
      "qa",
      "run",
      "--profile",
      "smoke-ci",
      "--category",
      "agent-runtime.agent-turn-execution",
    ]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBe("smoke-ci");
    expect(res.argv).toEqual([
      "node",
      "bot",
      "qa",
      "run",
      "--category",
      "agent-runtime.agent-turn-execution",
    ]);
  });

  it("parses qa run --profile=release self-check invocations as root profiles", () => {
    const res = parseCliProfileArgs([
      "node",
      "bot",
      "qa",
      "run",
      "--profile=release",
      "--output",
      "qa-report.md",
    ]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBe("release");
    expect(res.argv).toEqual(["node", "bot", "qa", "run", "--output", "qa-report.md"]);
  });

  it("preserves qa run --qa-profile for the command parser", () => {
    const res = parseCliProfileArgs([
      "node",
      "bot",
      "qa",
      "run",
      "--qa-profile",
      "smoke-ci",
      "--surface",
      "agent-runtime",
    ]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBeNull();
    expect(res.argv).toEqual([
      "node",
      "bot",
      "qa",
      "run",
      "--qa-profile",
      "smoke-ci",
      "--surface",
      "agent-runtime",
    ]);
  });

  it("parses arbitrary qa run --profile values as root profiles", () => {
    const res = parseCliProfileArgs([
      "node",
      "bot",
      "qa",
      "run",
      "--profile",
      "work",
      "--output",
      "qa-report.md",
    ]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBe("work");
    expect(res.argv).toEqual(["node", "bot", "qa", "run", "--output", "qa-report.md"]);
  });

  it("parses arbitrary qa run --profile= values as root profiles", () => {
    const res = parseCliProfileArgs([
      "node",
      "bot",
      "qa",
      "run",
      "--profile=work",
      "--output",
      "qa-report.md",
    ]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBe("work");
    expect(res.argv).toEqual(["node", "bot", "qa", "run", "--output", "qa-report.md"]);
  });

  it("still parses root --profile before qa run", () => {
    const res = parseCliProfileArgs([
      "node",
      "bot",
      "--profile",
      "work",
      "qa",
      "run",
      "--qa-profile",
      "smoke-ci",
    ]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBe("work");
    expect(res.argv).toEqual(["node", "bot", "qa", "run", "--qa-profile", "smoke-ci"]);
  });

  it("still parses root --profile before Matrix QA", () => {
    const res = parseCliProfileArgs([
      "node",
      "bot",
      "--profile",
      "work",
      "qa",
      "matrix",
      "--fail-fast",
    ]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBe("work");
    expect(res.argv).toEqual(["node", "bot", "qa", "matrix", "--fail-fast"]);
  });

  it("parses interleaved --dev after the command token", () => {
    const res = parseCliProfileArgs(["node", "bot", "status", "--dev"]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBe("dev");
    expect(res.argv).toEqual(["node", "bot", "status"]);
  });

  it("rejects missing profile value", () => {
    const res = parseCliProfileArgs(["node", "bot", "--profile"]);
    expect(res.ok).toBe(false);
  });

  it.each([
    ["--dev first", ["node", "bot", "--dev", "--profile", "work", "status"]],
    ["--profile first", ["node", "bot", "--profile", "work", "--dev", "status"]],
    ["interleaved after command", ["node", "bot", "status", "--profile", "work", "--dev"]],
  ])("rejects combining --dev with --profile (%s)", (_name, argv) => {
    const res = parseCliProfileArgs(argv);
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
      BOT_PROFILE: "prod",
      BOT_STATE_DIR: "/custom",
      BOT_GATEWAY_PORT: "19099",
    };
    applyCliProfileEnv({
      profile: "dev",
      env,
      homedir: () => "/home/peter",
    });
    expect(env.BOT_PROFILE).toBe("dev");
    expect(env.BOT_STATE_DIR).toBe("/custom");
    expect(env.BOT_GATEWAY_PORT).toBe("19099");
    expect(env.BOT_CONFIG_PATH).toBe(path.join("/custom", "bot.json"));
  });

  it.each([
    {
      name: "the default profile without a profile marker",
      inheritedProfile: undefined,
      inheritedStateDir: "/home/peter/.bot",
    },
    {
      name: "the explicitly marked default profile",
      inheritedProfile: "default",
      inheritedStateDir: "/home/peter/.bot",
    },
    {
      name: "another named profile",
      inheritedProfile: "main",
      inheritedStateDir: "/home/peter/.bot-main",
    },
    {
      name: "a home-relative default state directory",
      inheritedProfile: undefined,
      inheritedStateDir: "~/.bot",
    },
  ])(
    "switches inherited canonical state from $name to the requested profile",
    ({ inheritedProfile, inheritedStateDir }) => {
      const env: Record<string, string | undefined> = {
        BOT_PROFILE: inheritedProfile,
        BOT_STATE_DIR: inheritedStateDir,
        BOT_CONFIG_PATH: path.join(inheritedStateDir, "bot.json"),
      };

      applyCliProfileEnv({ profile: "work", env, homedir: () => "/home/peter" });

      const expectedStateDir = path.join(path.resolve("/home/peter"), ".bot-work");
      expect(env.BOT_PROFILE).toBe("work");
      expect(env.BOT_STATE_DIR).toBe(expectedStateDir);
      expect(env.BOT_CONFIG_PATH).toBe(path.join(expectedStateDir, "bot.json"));
    },
  );

  it("preserves an explicit config outside inherited canonical profile state", () => {
    const env: Record<string, string | undefined> = {
      BOT_PROFILE: "main",
      BOT_STATE_DIR: "/home/peter/.bot-main",
      BOT_CONFIG_PATH: "/srv/bot/custom.json",
    };

    applyCliProfileEnv({ profile: "work", env, homedir: () => "/home/peter" });

    expect(env.BOT_STATE_DIR).toBe("/home/peter/.bot-work");
    expect(env.BOT_CONFIG_PATH).toBe("/srv/bot/custom.json");
  });

  it.each([
    { inheritedProfile: "Main", selectedProfile: "main" },
    { inheritedProfile: "main", selectedProfile: "Main" },
  ])(
    "keeps case-distinct named profiles isolated ($inheritedProfile to $selectedProfile)",
    ({ inheritedProfile, selectedProfile }) => {
      const inheritedStateDir = `/home/peter/.bot-${inheritedProfile}`;
      const env: Record<string, string | undefined> = {
        BOT_PROFILE: inheritedProfile,
        BOT_STATE_DIR: inheritedStateDir,
        BOT_CONFIG_PATH: path.join(inheritedStateDir, "bot.json"),
      };

      applyCliProfileEnv({ profile: selectedProfile, env, homedir: () => "/home/peter" });

      const expectedStateDir = `/home/peter/.bot-${selectedProfile}`;
      expect(env.BOT_PROFILE).toBe(selectedProfile);
      expect(env.BOT_STATE_DIR).toBe(expectedStateDir);
      expect(env.BOT_CONFIG_PATH).toBe(path.join(expectedStateDir, "bot.json"));
    },
  );

  it("treats case variants of the default profile as the same canonical profile", () => {
    const stateDir = "/home/peter/.bot";
    const env: Record<string, string | undefined> = {
      BOT_PROFILE: "Default",
      BOT_STATE_DIR: stateDir,
      BOT_CONFIG_PATH: path.join(stateDir, "bot.json"),
    };

    applyCliProfileEnv({ profile: "default", env, homedir: () => "/home/peter" });

    expect(env.BOT_PROFILE).toBe("default");
    expect(env.BOT_STATE_DIR).toBe(stateDir);
    expect(env.BOT_CONFIG_PATH).toBe(path.join(stateDir, "bot.json"));
  });

  it.each([
    {
      name: "the default profile",
      inheritedProfile: undefined,
      inheritedConfigPath: "/home/peter/.hanzoai/bot.json",
    },
    {
      name: "another named profile",
      inheritedProfile: "main",
      inheritedConfigPath: "/home/peter/.bot-main/bot.json",
    },
    {
      name: "a home-relative named profile",
      inheritedProfile: "main",
      inheritedConfigPath: "~/.bot-main/bot.json",
    },
  ])(
    "switches an inherited $name config when the state directory is absent",
    ({ inheritedProfile, inheritedConfigPath }) => {
      const env: Record<string, string | undefined> = {
        BOT_PROFILE: inheritedProfile,
        BOT_CONFIG_PATH: inheritedConfigPath,
      };

      applyCliProfileEnv({ profile: "work", env, homedir: () => "/home/peter" });

      const expectedStateDir = "/home/peter/.bot-work";
      expect(env.BOT_PROFILE).toBe("work");
      expect(env.BOT_STATE_DIR).toBe(expectedStateDir);
      expect(env.BOT_CONFIG_PATH).toBe(path.join(expectedStateDir, "bot.json"));
    },
  );

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
    expect(env.BOT_CONFIG_PATH).toBe(
      path.join(resolvedHome, ".bot-work", "bot.json"),
    );
  });
});

describe("formatCliCommand", () => {
  it.each([
    {
      name: "no profile is set",
      cmd: "bot doctor --fix",
      env: {},
      expected: "bot doctor --fix",
    },
    {
      name: "profile is default",
      cmd: "bot doctor --fix",
      env: { BOT_PROFILE: "default" },
      expected: "bot doctor --fix",
    },
    {
      name: "profile is Default (case-insensitive)",
      cmd: "bot doctor --fix",
      env: { BOT_PROFILE: "Default" },
      expected: "bot doctor --fix",
    },
    {
      name: "profile is invalid",
      cmd: "bot doctor --fix",
      env: { BOT_PROFILE: "bad profile" },
      expected: "bot doctor --fix",
    },
    {
      name: "--profile is already present",
      cmd: "bot --profile work doctor --fix",
      env: { BOT_PROFILE: "work" },
      expected: "bot --profile work doctor --fix",
    },
    {
      name: "--dev is already present",
      cmd: "bot --dev doctor",
      env: { BOT_PROFILE: "dev" },
      expected: "bot --dev doctor",
    },
  ])("returns command unchanged when $name", ({ cmd, env, expected }) => {
    expect(formatCliCommand(cmd, env)).toBe(expected);
  });

  it("inserts --profile flag when profile is set", () => {
    expect(formatCliCommand("bot doctor --fix", { BOT_PROFILE: "work" })).toBe(
      "bot --profile work doctor --fix",
    );
  });

  it("trims whitespace from profile", () => {
    expect(formatCliCommand("bot doctor --fix", { BOT_PROFILE: "  jbbot  " })).toBe(
      "bot --profile jbbot doctor --fix",
    );
  });

  it("handles command with no args after bot", () => {
    expect(formatCliCommand("bot", { BOT_PROFILE: "test" })).toBe(
      "bot --profile test",
    );
  });

  it("handles pnpm wrapper", () => {
    expect(formatCliCommand("pnpm bot doctor", { BOT_PROFILE: "work" })).toBe(
      "pnpm bot --profile work doctor",
    );
  });

  it("inserts --container when a container hint is set", () => {
    expect(
      formatCliCommand("bot gateway status --deep", { BOT_CONTAINER_HINT: "demo" }),
    ).toBe("bot --container demo gateway status --deep");
  });

  it("ignores unsafe container hints", () => {
    expect(
      formatCliCommand("bot gateway status --deep", {
        BOT_CONTAINER_HINT: "demo; rm -rf /",
      }),
    ).toBe("bot gateway status --deep");
  });

  it("preserves both --container and --profile hints", () => {
    expect(
      formatCliCommand("bot doctor", {
        BOT_CONTAINER_HINT: "demo",
        BOT_PROFILE: "work",
      }),
    ).toBe("bot --container demo doctor");
  });

  it("does not prepend --container for update commands", () => {
    expect(formatCliCommand("bot update", { BOT_CONTAINER_HINT: "demo" })).toBe(
      "bot update",
    );
    expect(
      formatCliCommand("pnpm bot update --channel beta", { BOT_CONTAINER_HINT: "demo" }),
    ).toBe("pnpm bot update --channel beta");
  });
});
