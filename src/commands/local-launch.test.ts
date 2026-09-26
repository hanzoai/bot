import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readConfigFileSnapshot: vi.fn(),
  writeConfigFile: vi.fn(),
  upsertAuthProfile: vi.fn(),
  startGatewayServer: vi.fn(),
  openUrl: vi.fn(),
  resolveDashboardUrl: vi.fn(),
}));

vi.mock("../config/io.js", () => ({
  readConfigFileSnapshot: mocks.readConfigFileSnapshot,
  writeConfigFile: mocks.writeConfigFile,
}));
vi.mock("../agents/auth-profiles.js", () => ({ upsertAuthProfile: mocks.upsertAuthProfile }));
vi.mock("../gateway/server.js", () => ({ startGatewayServer: mocks.startGatewayServer }));
vi.mock("../cli/gateway-cli/run-loop.js", () => ({
  runGatewayLoop: async (params: { start: () => Promise<unknown> }) => await params.start(),
}));
vi.mock("./local-cloud-register.js", () => ({ registerLocalBot: async () => () => {} }));
vi.mock("./onboard-helpers.js", () => ({ openUrl: mocks.openUrl }));
vi.mock("./dashboard.js", () => ({ resolveDashboardUrl: mocks.resolveDashboardUrl }));

const { launchLocal } = await import("./local-launch.js");

describe("launchLocal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    mocks.openUrl.mockResolvedValue(true);
  });

  it("writes the Hanzo Cloud config on a machine with no bot.json and starts with Tailscale off", async () => {
    mocks.readConfigFileSnapshot.mockResolvedValue({ exists: false, path: "/h/.bot/bot.json" });
    await launchLocal({ accessToken: "iam-token" });
    expect(mocks.upsertAuthProfile).toHaveBeenCalledTimes(1);
    expect(mocks.writeConfigFile).toHaveBeenCalledWith(
      expect.objectContaining({
        models: { providers: { anthropic: { baseUrl: "https://api.hanzo.ai", models: [] } } },
      }),
    );
    expect(mocks.startGatewayServer).toHaveBeenCalledWith(18789, {
      bind: "loopback",
      auth: { mode: "none" },
      tailscale: { mode: "off" },
    });
    expect(mocks.openUrl).toHaveBeenCalledWith("http://127.0.0.1:18789/");
  });

  it("starts an existing bot.json with its own auth, bind, Tailscale and port", async () => {
    const config = { gateway: { port: 19001, tailscale: { mode: "serve" } } };
    mocks.readConfigFileSnapshot.mockResolvedValue({
      exists: true,
      valid: true,
      path: "/h/.bot/bot.json",
      config,
    });
    mocks.resolveDashboardUrl.mockResolvedValue({
      url: "http://127.0.0.1:19001/#token=t",
      httpUrl: "http://127.0.0.1:19001/",
    });
    await launchLocal({ accessToken: "iam-token" });
    expect(mocks.writeConfigFile).not.toHaveBeenCalled();
    expect(mocks.upsertAuthProfile).not.toHaveBeenCalled();
    expect(mocks.startGatewayServer).toHaveBeenCalledWith(19001, {});
    expect(mocks.resolveDashboardUrl).toHaveBeenCalledWith(config);
    expect(mocks.openUrl).toHaveBeenCalledWith("http://127.0.0.1:19001/#token=t");
    const printed = vi.mocked(console.log).mock.calls.flat().join("\n");
    expect(printed).not.toContain("#token=");
  });
});
