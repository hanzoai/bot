import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readConfigFileSnapshot: vi.fn(),
  writeConfigFile: vi.fn(),
  upsertAuthProfile: vi.fn(),
  runGatewayLoop: vi.fn(),
}));

vi.mock("../config/io.js", () => ({
  readConfigFileSnapshot: mocks.readConfigFileSnapshot,
  writeConfigFile: mocks.writeConfigFile,
}));
vi.mock("../agents/auth-profiles.js", () => ({ upsertAuthProfile: mocks.upsertAuthProfile }));
vi.mock("../gateway/server.js", () => ({ startGatewayServer: vi.fn() }));
vi.mock("../cli/gateway-cli/run-loop.js", () => ({ runGatewayLoop: mocks.runGatewayLoop }));
vi.mock("./onboard-helpers.js", () => ({ openUrl: vi.fn() }));

const { launchLocal } = await import("./local-launch.js");

describe("launchLocal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("writes the Hanzo Cloud config on a machine with no bot.json", async () => {
    mocks.readConfigFileSnapshot.mockResolvedValue({ exists: false, path: "/h/.bot/bot.json" });
    await launchLocal({ accessToken: "iam-token" });
    expect(mocks.upsertAuthProfile).toHaveBeenCalledTimes(1);
    expect(mocks.writeConfigFile).toHaveBeenCalledWith(
      expect.objectContaining({
        models: { providers: { anthropic: { baseUrl: "https://api.hanzo.ai", models: [] } } },
      }),
    );
    expect(mocks.runGatewayLoop).toHaveBeenCalledTimes(1);
  });

  it("uses an existing bot.json as it is", async () => {
    mocks.readConfigFileSnapshot.mockResolvedValue({ exists: true, path: "/h/.bot/bot.json" });
    await launchLocal({ accessToken: "iam-token" });
    expect(mocks.writeConfigFile).not.toHaveBeenCalled();
    expect(mocks.upsertAuthProfile).not.toHaveBeenCalled();
    expect(mocks.runGatewayLoop).toHaveBeenCalledTimes(1);
  });
});
