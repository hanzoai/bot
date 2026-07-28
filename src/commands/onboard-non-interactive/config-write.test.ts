import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BotConfig } from "../../config/types.bot.js";

const writeWizardConfigFile = vi.hoisted(() => vi.fn());

vi.mock("../../wizard/setup.shared.js", () => ({ writeWizardConfigFile }));

import { commitNonInteractiveOnboardConfig } from "./config-write.js";

describe("commitNonInteractiveOnboardConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    writeWizardConfigFile.mockImplementation(async (config: BotConfig) => config);
  });

  it("keeps the verified config hash and pending-install owner on the canonical writer", async () => {
    const baseConfig: BotConfig = {
      plugins: {
        installs: { demo: { source: "npm", spec: "demo@1.0.0" } },
      },
    };
    const nextConfig: BotConfig = {
      ...baseConfig,
      gateway: { port: 19_001 },
    };

    await expect(
      commitNonInteractiveOnboardConfig({
        nextConfig,
        baseConfig,
        baseHash: "verified-config-hash",
      }),
    ).resolves.toBe(nextConfig);

    expect(writeWizardConfigFile).toHaveBeenCalledWith(nextConfig, {
      allowConfigSizeDrop: false,
      baseHash: "verified-config-hash",
      migrationBaseConfig: baseConfig,
    });
  });

  it("permits config size reduction only for an explicitly requested reset", async () => {
    const baseConfig: BotConfig = { gateway: { port: 19_001 } };
    const nextConfig: BotConfig = {};

    await commitNonInteractiveOnboardConfig({
      nextConfig,
      baseConfig,
      reset: true,
    });

    expect(writeWizardConfigFile).toHaveBeenCalledWith(nextConfig, {
      allowConfigSizeDrop: true,
      migrationBaseConfig: baseConfig,
    });
  });
});
