// Log file path tests cover profile-aware rolling filename resolution.
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  isLegacyRollingLogFilePath,
  isSameRollingLogFileFamily,
  resolveConfiguredLogFilePath,
  resolveRollingLogFilePathForDate,
} from "./log-file-path.js";

const date = new Date(2026, 6, 22, 12, 0, 0);

describe("resolveConfiguredLogFilePath", () => {
  it.each([
    { name: "unset", env: {}, expected: "bot-2026-07-22.log" },
    {
      name: "explicit default",
      env: { BOT_PROFILE: "Default" },
      expected: "bot-2026-07-22.log",
    },
    {
      name: "named",
      env: { BOT_PROFILE: "dev" },
      expected: "bot-dev-2026-07-22.log",
    },
    {
      name: "sanitized",
      env: { BOT_PROFILE: "QA_Profile" },
      expected: "bot--1q-1a-0-1profile-2026-07-22.log",
    },
  ])("uses the $name profile filename", ({ env, expected }) => {
    const resolved = resolveConfiguredLogFilePath(undefined, { date, env });

    expect(path.basename(resolved)).toBe(expected);
  });

  it("keeps profiles distinct when sanitization would otherwise collide", () => {
    const underscored = resolveConfiguredLogFilePath(undefined, {
      date,
      env: { BOT_PROFILE: "QA_Profile" },
    });
    const dashed = resolveConfiguredLogFilePath(undefined, {
      date,
      env: { BOT_PROFILE: "qa-profile" },
    });

    expect(underscored).not.toBe(dashed);
    expect(path.basename(dashed)).toBe("bot-qa--profile-2026-07-22.log");
  });

  it("keeps escaped output distinct from a profile that resembles the encoding", () => {
    const transformed = resolveConfiguredLogFilePath(undefined, {
      date,
      env: { BOT_PROFILE: "QA_Profile" },
    });
    const lookalike = resolveConfiguredLogFilePath(undefined, {
      date,
      env: { BOT_PROFILE: "-1q-1a-0-1profile" },
    });

    expect(transformed).not.toBe(lookalike);
  });

  it("bounds direct environment profiles that exceed the CLI length contract", () => {
    const first = resolveConfiguredLogFilePath(undefined, {
      date,
      env: { BOT_PROFILE: "A".repeat(80) },
    });
    const second = resolveConfiguredLogFilePath(undefined, {
      date,
      env: { BOT_PROFILE: "B".repeat(80) },
    });

    expect(path.basename(first)).toMatch(/^bot--3[a-f0-9]{64}-2026-07-22\.log$/u);
    expect(path.basename(first).length).toBeLessThanOrEqual(255);
    expect(first).not.toBe(second);
  });

  it("preserves an explicit logging.file override", () => {
    expect(
      resolveConfiguredLogFilePath(
        { logging: { file: "/var/log/bot/custom.log" } },
        { date, env: { BOT_PROFILE: "dev" } },
      ),
    ).toBe("/var/log/bot/custom.log");
  });
});

describe("profile rolling log families", () => {
  it("preserves the profile segment across date rollover", () => {
    expect(
      resolveRollingLogFilePathForDate(
        "/tmp/hanzoai/bot-dev-2026-07-22.log",
        new Date(2026, 6, 23, 12, 0, 0),
      ),
    ).toBe("/tmp/hanzoai/bot-dev-2026-07-23.log");
  });

  it("expands the legacy YYYY-MM-DD placeholder", () => {
    expect(
      resolveRollingLogFilePathForDate(
        "/tmp/hanzoai/bot-YYYY-MM-DD.log",
        new Date(2026, 6, 23, 12, 0, 0),
      ),
    ).toBe("/tmp/hanzoai/bot-2026-07-23.log");
  });

  it("keeps default and named profile fallback families separate", () => {
    expect(
      isSameRollingLogFileFamily("bot-dev-2026-07-22.log", "bot-dev-2026-07-21.log"),
    ).toBe(true);
    expect(
      isSameRollingLogFileFamily("bot-dev-2026-07-22.log", "bot-2026-07-22.log"),
    ).toBe(false);
  });

  it("keeps legacy explicit dated paths rolling without broadening the override contract", () => {
    expect(isLegacyRollingLogFilePath("bot-2026-07-22.log")).toBe(true);
    expect(isLegacyRollingLogFilePath("bot-YYYY-MM-DD.log")).toBe(true);
    expect(isLegacyRollingLogFilePath("bot-dev-2026-07-22.log")).toBe(false);
  });
});
