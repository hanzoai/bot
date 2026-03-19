import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HanzoBotConfig } from "../config/config.js";

const mocks = vi.hoisted(() => ({
  memoryRegister: vi.fn(),
  otherRegister: vi.fn(),
  loadHanzoBotPlugins: vi.fn(),
}));

vi.mock("./loader.js", () => ({
  loadHanzoBotPlugins: (...args: unknown[]) => mocks.loadHanzoBotPlugins(...args),
}));

import { registerPluginCliCommands } from "./cli.js";

describe("registerPluginCliCommands", () => {
  beforeEach(() => {
    mocks.memoryRegister.mockClear();
    mocks.otherRegister.mockClear();
    mocks.loadHanzoBotPlugins.mockReset();
    mocks.loadHanzoBotPlugins.mockReturnValue({
      cliRegistrars: [
        {
          pluginId: "memory-core",
          register: mocks.memoryRegister,
          commands: ["memory"],
          source: "bundled",
        },
        {
          pluginId: "other",
          register: mocks.otherRegister,
          commands: ["other"],
          source: "bundled",
        },
      ],
    });
  });

  it("skips plugin CLI registrars when commands already exist", () => {
    const program = new Command();
    program.command("memory");

    // oxlint-disable-next-line typescript/no-explicit-any
    registerPluginCliCommands(program, {} as any);

    expect(mocks.memoryRegister).not.toHaveBeenCalled();
    expect(mocks.otherRegister).toHaveBeenCalledTimes(1);
  });

  it("forwards an explicit env to plugin loading", () => {
    const program = new Command();
    const env = { BOT_HOME: "/srv/openclaw-home" } as NodeJS.ProcessEnv;

    registerPluginCliCommands(program, {} as HanzoBotConfig, env);

    expect(mocks.loadHanzoBotPlugins).toHaveBeenCalledWith(
      expect.objectContaining({
        env,
      }),
    );
  });
});
