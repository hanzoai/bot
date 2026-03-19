import { describe, expect, it, vi } from "vitest";
import { createTestPluginApi } from "../../test/helpers/extensions/plugin-api.js";
import plugin from "./index.js";
import type { Hanzo BotPluginApi } from "./runtime-api.js";

function createApi(
  registrationMode: Hanzo BotPluginApi["registrationMode"],
  registerHttpRoute = vi.fn(),
): Hanzo BotPluginApi {
  return createTestPluginApi({
    id: "mattermost",
    name: "Mattermost",
    source: "test",
    config: {},
    runtime: {} as Hanzo BotPluginApi["runtime"],
    registrationMode,
    registerHttpRoute,
  });
}

describe("mattermost plugin register", () => {
  it("skips slash callback registration in setup-only mode", () => {
    const registerHttpRoute = vi.fn();

    plugin.register(createApi("setup-only", registerHttpRoute));

    expect(registerHttpRoute).not.toHaveBeenCalled();
  });

  it("registers slash callback routes in full mode", () => {
    const registerHttpRoute = vi.fn();

    plugin.register(createApi("full", registerHttpRoute));

    expect(registerHttpRoute).toHaveBeenCalledTimes(1);
    expect(registerHttpRoute).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/api/channels/mattermost/command",
        auth: "plugin",
      }),
    );
  });
});
