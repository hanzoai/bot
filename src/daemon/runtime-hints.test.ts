// Daemon runtime hint tests cover platform-specific daemon guidance.
import { describe, expect, it } from "vitest";
import { buildPlatformRuntimeLogHints, buildPlatformServiceStartHints } from "./runtime-hints.js";

describe("buildPlatformRuntimeLogHints", () => {
  it("renders launchd log hints on darwin", () => {
    expect(
      buildPlatformRuntimeLogHints({
        platform: "darwin",
        env: {
          HOME: "/Users/test",
          BOT_STATE_DIR: "/tmp/bot-state",
          BOT_LOG_PREFIX: "gateway",
        },
        systemdServiceName: "bot-gateway",
        windowsTaskName: "Bot Gateway",
      }),
    ).toEqual([
      "Launchd stdout (if installed): /Users/test/Library/Logs/bot/gateway.log",
      "Launchd stderr (if installed): suppressed",
      "Restart attempts: /tmp/bot-state/logs/gateway-restart.log",
    ]);
  });

  it("renders systemd and windows hints by platform", () => {
    expect(
      buildPlatformRuntimeLogHints({
        platform: "linux",
        env: {
          BOT_STATE_DIR: "/tmp/bot-state",
        },
        systemdServiceName: "bot-gateway",
        windowsTaskName: "Bot Gateway",
      }),
    ).toEqual([
      "Logs: journalctl --user -u bot-gateway.service -n 200 --no-pager",
      "Restart attempts: /tmp/bot-state/logs/gateway-restart.log",
    ]);
    expect(
      buildPlatformRuntimeLogHints({
        platform: "win32",
        env: {
          BOT_STATE_DIR: "/tmp/bot-state",
        },
        systemdServiceName: "bot-gateway",
        windowsTaskName: "Bot Gateway",
      }),
    ).toEqual([
      'Logs: schtasks /Query /TN "Bot Gateway" /V /FO LIST',
      "Restart attempts: /tmp/bot-state/logs/gateway-restart.log",
    ]);
  });
});

describe("buildPlatformServiceStartHints", () => {
  it("builds platform-specific service start hints", () => {
    expect(
      buildPlatformServiceStartHints({
        platform: "darwin",
        installCommand: "bot gateway install",
        startCommand: "bot gateway",
        launchAgentPlistPath: "~/Library/LaunchAgents/com.bot.gateway.plist",
        systemdServiceName: "bot-gateway",
        windowsTaskName: "Bot Gateway",
      }),
    ).toEqual([
      "bot gateway install",
      "bot gateway",
      "launchctl bootstrap gui/$UID ~/Library/LaunchAgents/com.bot.gateway.plist",
    ]);
    expect(
      buildPlatformServiceStartHints({
        platform: "linux",
        installCommand: "bot gateway install",
        startCommand: "bot gateway",
        launchAgentPlistPath: "~/Library/LaunchAgents/com.bot.gateway.plist",
        systemdServiceName: "bot-gateway",
        windowsTaskName: "Bot Gateway",
      }),
    ).toEqual([
      "bot gateway install",
      "bot gateway",
      "systemctl --user start bot-gateway.service",
    ]);
  });
});
