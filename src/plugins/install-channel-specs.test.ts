import { describe, expect, it } from "vitest";
import {
  resolveClawHubInstallSpecsForUpdateChannel,
  resolveNpmInstallSpecsForUpdateChannel,
} from "./install-channel-specs.js";

describe("resolveNpmInstallSpecsForUpdateChannel", () => {
  it.each(["@hanzo/bot-discord", "@hanzo/bot-discord@latest"])(
    "targets the exact core version for official extended-stable intent %s",
    (spec) => {
      expect(
        resolveNpmInstallSpecsForUpdateChannel({
          spec,
          updateChannel: "extended-stable",
          officialPackageName: "@hanzo/bot-discord",
          coreVersion: "2026.7.33",
        }),
      ).toEqual({
        installSpec: "@hanzo/bot-discord@2026.7.33",
        recordSpec: spec,
      });
    },
  );

  it.each([
    "@hanzo/bot-discord@2026.6.33",
    "@hanzo/bot-discord@next",
    "@hanzo/bot-discord@beta",
    "@hanzo/bot-discord@^2026.6.0",
    "https://registry.example.test/discord.tgz",
  ])("preserves explicit extended-stable intent %s", (spec) => {
    expect(
      resolveNpmInstallSpecsForUpdateChannel({
        spec,
        updateChannel: "extended-stable",
        officialPackageName: "@hanzo/bot-discord",
        coreVersion: "2026.7.33",
      }),
    ).toEqual({ installSpec: spec, recordSpec: spec });
  });

  it("does not rewrite a third-party package", () => {
    expect(
      resolveNpmInstallSpecsForUpdateChannel({
        spec: "@acme/discord",
        updateChannel: "extended-stable",
        officialPackageName: "@hanzo/bot-discord",
        coreVersion: "2026.7.33",
      }),
    ).toEqual({ installSpec: "@acme/discord", recordSpec: "@acme/discord" });
  });

  it("fails closed without an authoritative extended-stable core version", () => {
    expect(() =>
      resolveNpmInstallSpecsForUpdateChannel({
        spec: "@hanzo/bot-discord",
        updateChannel: "extended-stable",
        officialPackageName: "@hanzo/bot-discord",
      }),
    ).toThrow("requires an exact core version");
  });

  it("preserves beta behavior", () => {
    expect(
      resolveNpmInstallSpecsForUpdateChannel({
        spec: "@hanzo/bot-discord@latest",
        updateChannel: "beta",
        officialPackageName: "@hanzo/bot-discord",
        coreVersion: "2026.7.33",
      }),
    ).toEqual({
      installSpec: "@hanzo/bot-discord@beta",
      recordSpec: "@hanzo/bot-discord@latest",
      fallbackSpec: "@hanzo/bot-discord@latest",
      fallbackLabel: "@hanzo/bot-discord@beta",
    });
  });
});

describe("resolveClawHubInstallSpecsForUpdateChannel", () => {
  it("does not rewrite ClawHub on extended-stable", () => {
    expect(
      resolveClawHubInstallSpecsForUpdateChannel({
        spec: "clawhub:@hanzo/bot-discord",
        updateChannel: "extended-stable",
      }),
    ).toEqual({
      installSpec: "clawhub:@hanzo/bot-discord",
      recordSpec: "clawhub:@hanzo/bot-discord",
    });
  });
});
