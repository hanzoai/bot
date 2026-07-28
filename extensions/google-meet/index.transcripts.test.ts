import type { BotPluginApi } from "bot/plugin-sdk/plugin-entry";
import { createTestPluginApi } from "bot/plugin-sdk/plugin-test-api";
import type { TranscriptSourceProvider } from "bot/plugin-sdk/transcripts";
import { describe, expect, it } from "vitest";
import plugin from "./index.js";

describe("Google Meet transcript source registration", () => {
  it("registers the canonical provider and aliases", () => {
    const providers: TranscriptSourceProvider[] = [];
    const api = createTestPluginApi({
      id: "google-meet",
      name: "Google Meet",
      description: "test",
      version: "0",
      source: "test",
      config: {},
      pluginConfig: {},
      runtime: {} as BotPluginApi["runtime"],
      registerTranscriptSourceProvider: (provider) => providers.push(provider),
    });

    plugin.register(api);

    expect(providers).toEqual([
      expect.objectContaining({
        id: "google-meet",
        aliases: ["googlemeet", "meet"],
        sourceKinds: ["live-caption"],
      }),
    ]);
  });
});
