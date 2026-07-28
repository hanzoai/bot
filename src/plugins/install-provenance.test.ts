import { describe, expect, it } from "vitest";
import type { BundledPluginSource } from "./bundled-sources.js";
import { isBotTrustedPluginInstallSpec } from "./install-provenance.js";

const bundledSources = new Map<string, BundledPluginSource>([
  [
    "discord",
    {
      pluginId: "discord",
      localPath: "/opt/bot/extensions/discord",
      npmSpec: "@hanzo/bot-discord",
    },
  ],
]);

describe("plugin install provenance", () => {
  it.each([
    "discord",
    "@hanzo/bot-discord",
    "npm:@hanzo/bot-discord",
    "/opt/bot/extensions/discord",
    "brave",
    "npm:@hanzo/bot-brave-plugin",
    "clawhub:bot-demo",
  ])("trusts Bot-owned install source %s", (spec) => {
    expect(isBotTrustedPluginInstallSpec(spec, bundledSources)).toBe(true);
  });

  it.each(["npm:discord", "npm:@example/plugin", "/tmp/example-plugin"])(
    "keeps arbitrary install source %s untrusted",
    (spec) => {
      expect(isBotTrustedPluginInstallSpec(spec, bundledSources)).toBe(false);
    },
  );
});
