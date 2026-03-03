import { beforeEach, describe, expect, it, vi } from "vitest";

const execFileMock = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({
  execFile: execFileMock,
}));

import { splitArgsPreservingQuotes } from "./arg-split.js";
import { parseSystemdExecStart } from "./systemd-unit.js";
import {
  isSystemdUserServiceAvailable,
  parseSystemdShow,
  resolveSystemdUserUnitPath,
} from "./systemd.js";

describe("systemd availability", () => {
  beforeEach(() => {
    execFileMock.mockReset();
  });

  it("returns true when systemctl --user succeeds", async () => {
    execFileMock.mockImplementation((_cmd, _args, _opts, cb) => {
      cb(null, "", "");
    });
    await expect(isSystemdUserServiceAvailable()).resolves.toBe(true);
  });

  it("returns false when systemd user bus is unavailable", async () => {
    execFileMock.mockImplementation((_cmd, _args, _opts, cb) => {
      const err = new Error("Failed to connect to bus") as Error & {
        stderr?: string;
        code?: number;
      };
      err.stderr = "Failed to connect to bus";
      err.code = 1;
      cb(err, "", "");
    });
    await expect(isSystemdUserServiceAvailable()).resolves.toBe(false);
  });
});

describe("isSystemdServiceEnabled", () => {
  beforeEach(() => {
    execFileMock.mockClear();
  });

  it("returns false when systemctl is not present", async () => {
    const { isSystemdServiceEnabled } = await import("./systemd.js");
    execFileMock.mockImplementation((_cmd, _args, _opts, cb) => {
      const err = new Error("spawn systemctl EACCES") as Error & { code?: string };
      err.code = "EACCES";
      cb(err, "", "");
    });
    const result = await isSystemdServiceEnabled({ env: {} });
    expect(result).toBe(false);
  });

  it("calls systemctl is-enabled when systemctl is present", async () => {
    const { isSystemdServiceEnabled } = await import("./systemd.js");
    execFileMock.mockImplementationOnce((_cmd, args, _opts, cb) => {
      expect(args).toEqual(["--user", "is-enabled", "bot-gateway.service"]);
      cb(null, "enabled", "");
    });
    const result = await isSystemdServiceEnabled({ env: {} });
    expect(result).toBe(true);
  });

  it("returns false when systemctl reports disabled", async () => {
    const { isSystemdServiceEnabled } = await import("./systemd.js");
    execFileMock.mockImplementationOnce((_cmd, _args, _opts, cb) => {
      const err = new Error("disabled") as Error & { code?: number };
      err.code = 1;
      cb(err, "disabled", "");
    });
    const result = await isSystemdServiceEnabled({ env: {} });
    expect(result).toBe(false);
  });

  it("throws when systemctl is-enabled fails for non-state errors", async () => {
    const { isSystemdServiceEnabled } = await import("./systemd.js");
    execFileMock.mockImplementationOnce((_cmd, _args, _opts, cb) => {
      const err = new Error("Failed to connect to bus") as Error & { code?: number };
      err.code = 1;
      cb(err, "", "Failed to connect to bus");
    });
    await expect(isSystemdServiceEnabled({ env: {} })).rejects.toThrow(
      "systemctl is-enabled unavailable: Failed to connect to bus",
    );
  });
});

describe("systemd runtime parsing", () => {
  it("parses active state details", () => {
    const output = [
      "ActiveState=inactive",
      "SubState=dead",
      "MainPID=0",
      "ExecMainStatus=2",
      "ExecMainCode=exited",
    ].join("\n");
    expect(parseSystemdShow(output)).toEqual({
      activeState: "inactive",
      subState: "dead",
      execMainStatus: 2,
      execMainCode: "exited",
    });
  });
});

describe("resolveSystemdUserUnitPath", () => {
  it("uses default service name when BOT_PROFILE is unset", () => {
    const env = { HOME: "/home/test" };
    expect(resolveSystemdUserUnitPath(env)).toBe(
      "/home/test/.config/systemd/user/bot-gateway.service",
    );
  });

  it("uses profile-specific service name when BOT_PROFILE is set to a custom value", () => {
    const env = { HOME: "/home/test", BOT_PROFILE: "jbphoenix" };
    expect(resolveSystemdUserUnitPath(env)).toBe(
      "/home/test/.config/systemd/user/bot-gateway-jbphoenix.service",
    );
  });

  it("prefers BOT_SYSTEMD_UNIT over BOT_PROFILE", () => {
    const env = {
      HOME: "/home/test",
      BOT_PROFILE: "jbphoenix",
      BOT_SYSTEMD_UNIT: "custom-unit",
    };
    expect(resolveSystemdUserUnitPath(env)).toBe(
      "/home/test/.config/systemd/user/custom-unit.service",
    );
  });

  it("handles BOT_SYSTEMD_UNIT with .service suffix", () => {
    const env = {
      HOME: "/home/test",
      BOT_SYSTEMD_UNIT: "custom-unit.service",
    };
    expect(resolveSystemdUserUnitPath(env)).toBe(
      "/home/test/.config/systemd/user/custom-unit.service",
    );
  });

  it("trims whitespace from BOT_SYSTEMD_UNIT", () => {
    const env = {
      HOME: "/home/test",
      BOT_SYSTEMD_UNIT: "  custom-unit  ",
    };
    expect(resolveSystemdUserUnitPath(env)).toBe(
      "/home/test/.config/systemd/user/custom-unit.service",
    );
  });
});

describe("splitArgsPreservingQuotes", () => {
  it("splits on whitespace outside quotes", () => {
    expect(splitArgsPreservingQuotes('/usr/bin/bot gateway start --name "My Bot"')).toEqual([
      "/usr/bin/bot",
      "gateway",
      "start",
      "--name",
      "My Bot",
    ]);
  });

  it("supports systemd-style backslash escaping", () => {
    expect(
      splitArgsPreservingQuotes('bot --name "My \\"Bot\\"" --foo bar', {
        escapeMode: "backslash",
      }),
    ).toEqual(["bot", "--name", 'My "Bot"', "--foo", "bar"]);
  });

  it("supports schtasks-style escaped quotes while preserving other backslashes", () => {
    expect(
      splitArgsPreservingQuotes('bot --path "C:\\\\Program Files\\\\Bot"', {
        escapeMode: "backslash-quote-only",
      }),
    ).toEqual(["bot", "--path", "C:\\\\Program Files\\\\Bot"]);

    expect(
      splitArgsPreservingQuotes('bot --label "My \\"Quoted\\" Name"', {
        escapeMode: "backslash-quote-only",
      }),
    ).toEqual(["bot", "--label", 'My "Quoted" Name']);
  });
});

describe("parseSystemdExecStart", () => {
  it("preserves quoted arguments", () => {
    const execStart = '/usr/bin/bot gateway start --name "My Bot"';
    expect(parseSystemdExecStart(execStart)).toEqual([
      "/usr/bin/bot",
      "gateway",
      "start",
      "--name",
      "My Bot",
    ]);
  });
});
