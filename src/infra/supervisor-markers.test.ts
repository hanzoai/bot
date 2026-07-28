// Covers supervisor marker files used to identify managed Bot processes.
import { describe, expect, it } from "vitest";
import {
  detectGatewayRespawnSupervisor,
  detectRespawnSupervisor,
  SUPERVISOR_HINT_ENV_VARS,
} from "./supervisor-markers.js";

describe("SUPERVISOR_HINT_ENV_VARS", () => {
  it("includes the cross-platform supervisor hint env vars", () => {
    const envVars = new Set(SUPERVISOR_HINT_ENV_VARS);
    expect(envVars.has("BOT_SUPERVISOR_MODE")).toBe(true);
    expect(envVars.has("LAUNCH_JOB_LABEL")).toBe(true);
    expect(envVars.has("INVOCATION_ID")).toBe(true);
    expect(envVars.has("BOT_WINDOWS_TASK_NAME")).toBe(true);
    expect(envVars.has("BOT_SERVICE_MARKER")).toBe(true);
    expect(envVars.has("BOT_SERVICE_KIND")).toBe(true);
  });
});

describe("detectRespawnSupervisor", () => {
  it("detects launchd from Bot's explicit marker or current gateway launchd job", () => {
    expect(
      detectRespawnSupervisor({ BOT_LAUNCHD_LABEL: " ai.bot.gateway " }, "darwin"),
    ).toBe("launchd");
    expect(detectRespawnSupervisor({ BOT_LAUNCHD_LABEL: "   " }, "darwin")).toBeNull();
    expect(detectRespawnSupervisor({ LAUNCH_JOB_LABEL: "ai.bot.gateway" }, "darwin")).toBe(
      "launchd",
    );
    expect(
      detectRespawnSupervisor(
        { LAUNCH_JOB_NAME: "ai.bot.work", BOT_PROFILE: "work" },
        "darwin",
      ),
    ).toBe("launchd");
    expect(detectRespawnSupervisor({ LAUNCH_JOB_LABEL: "ai.bot.mac" }, "darwin")).toBeNull();
    expect(detectRespawnSupervisor({ XPC_SERVICE_NAME: "ai.bot.mac" }, "darwin")).toBeNull();
    expect(
      detectRespawnSupervisor(
        { XPC_SERVICE_NAME: "ai.bot.mac", BOT_PROFILE: "mac" },
        "darwin",
      ),
    ).toBeNull();
    expect(detectRespawnSupervisor({ XPC_SERVICE_NAME: "ai.bot.gateway" }, "darwin")).toBe(
      "launchd",
    );
  });

  it("detects systemd only from non-blank platform-specific hints", () => {
    expect(detectRespawnSupervisor({ INVOCATION_ID: "abc123" }, "linux")).toBe("systemd");
    expect(detectRespawnSupervisor({ JOURNAL_STREAM: "" }, "linux")).toBeNull();
  });

  it("detects Linux Bot gateway service markers only for opt-in callers", () => {
    const gatewayServiceEnv = {
      BOT_SERVICE_MARKER: " bot ",
      BOT_SERVICE_KIND: " gateway ",
    };
    expect(detectRespawnSupervisor(gatewayServiceEnv, "linux")).toBeNull();
    expect(
      detectRespawnSupervisor(gatewayServiceEnv, "linux", {
        includeLinuxBotGatewayServiceMarker: true,
      }),
    ).toBe("systemd");
    expect(
      detectRespawnSupervisor(
        {
          BOT_SERVICE_MARKER: "bot",
          BOT_SERVICE_KIND: "worker",
        },
        "linux",
        { includeLinuxBotGatewayServiceMarker: true },
      ),
    ).toBeNull();
    expect(
      detectRespawnSupervisor(
        {
          BOT_SERVICE_MARKER: "other",
          BOT_SERVICE_KIND: "gateway",
        },
        "linux",
        { includeLinuxBotGatewayServiceMarker: true },
      ),
    ).toBeNull();
  });

  it("detects scheduled-task supervision on Windows from either hint family", () => {
    expect(
      detectRespawnSupervisor({ BOT_WINDOWS_TASK_NAME: "Bot Gateway" }, "win32"),
    ).toBe("schtasks");
    expect(
      detectRespawnSupervisor(
        {
          BOT_SERVICE_MARKER: "bot",
          BOT_SERVICE_KIND: "gateway",
        },
        "win32",
      ),
    ).toBe("schtasks");
    expect(
      detectRespawnSupervisor(
        {
          BOT_SERVICE_MARKER: "bot",
          BOT_SERVICE_KIND: "worker",
        },
        "win32",
      ),
    ).toBeNull();
  });

  it("ignores service markers on non-Windows platforms and unknown platforms", () => {
    expect(
      detectRespawnSupervisor(
        {
          BOT_SERVICE_MARKER: "bot",
          BOT_SERVICE_KIND: "gateway",
        },
        "linux",
      ),
    ).toBeNull();
    expect(
      detectRespawnSupervisor({ LAUNCH_JOB_LABEL: "ai.bot.gateway" }, "freebsd"),
    ).toBeNull();
  });
});

describe("detectGatewayRespawnSupervisor", () => {
  it("keeps external ownership separate from native supervisor detection", () => {
    const env = {
      BOT_SUPERVISOR_MODE: "external",
      BOT_LAUNCHD_LABEL: "ai.bot.gateway",
    };

    expect(detectGatewayRespawnSupervisor(env, "darwin")).toBe("external");
    expect(detectRespawnSupervisor(env, "darwin")).toBe("launchd");
  });
});
