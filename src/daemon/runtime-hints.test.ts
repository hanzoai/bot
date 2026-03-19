import { describe, expect, it } from "vitest";
import { buildPlatformRuntimeLogHints, buildPlatformServiceStartHints } from "./runtime-hints.js";

describe("buildPlatformRuntimeLogHints", () => {
  it("renders launchd log hints on darwin", () => {
    expect(
      buildPlatformRuntimeLogHints({
        platform: "darwin",
        env: {
          BOT_STATE_DIR: "/tmp/openclaw-state",
          BOT_LOG_PREFIX: "gateway",
        },
        systemdServiceName: "openclaw-gateway",
        windowsTaskName: "Hanzo Bot Gateway",
      }),
    ).toEqual([
      "Launchd stdout (if installed): /tmp/openclaw-state/logs/gateway.log",
      "Launchd stderr (if installed): /tmp/openclaw-state/logs/gateway.err.log",
    ]);
  });

  it("renders systemd and windows hints by platform", () => {
    expect(
      buildPlatformRuntimeLogHints({
        platform: "linux",
        systemdServiceName: "openclaw-gateway",
        windowsTaskName: "Hanzo Bot Gateway",
      }),
    ).toEqual(["Logs: journalctl --user -u openclaw-gateway.service -n 200 --no-pager"]);
    expect(
      buildPlatformRuntimeLogHints({
        platform: "win32",
        systemdServiceName: "openclaw-gateway",
        windowsTaskName: "Hanzo Bot Gateway",
      }),
    ).toEqual(['Logs: schtasks /Query /TN "Hanzo Bot Gateway" /V /FO LIST']);
  });
});

describe("buildPlatformServiceStartHints", () => {
  it("builds platform-specific service start hints", () => {
    expect(
      buildPlatformServiceStartHints({
        platform: "darwin",
        installCommand: "hanzo-bot gateway install",
        startCommand: "hanzo-bot gateway",
        launchAgentPlistPath: "~/Library/LaunchAgents/com.openclaw.gateway.plist",
        systemdServiceName: "openclaw-gateway",
        windowsTaskName: "Hanzo Bot Gateway",
      }),
    ).toEqual([
      "hanzo-bot gateway install",
      "hanzo-bot gateway",
      "launchctl bootstrap gui/$UID ~/Library/LaunchAgents/com.openclaw.gateway.plist",
    ]);
    expect(
      buildPlatformServiceStartHints({
        platform: "linux",
        installCommand: "hanzo-bot gateway install",
        startCommand: "hanzo-bot gateway",
        launchAgentPlistPath: "~/Library/LaunchAgents/com.openclaw.gateway.plist",
        systemdServiceName: "openclaw-gateway",
        windowsTaskName: "Hanzo Bot Gateway",
      }),
    ).toEqual([
      "hanzo-bot gateway install",
      "hanzo-bot gateway",
      "systemctl --user start openclaw-gateway.service",
    ]);
  });
});
