// Interactive surface auth tests document token precedence for remote gateway
// surfaces that need browser or control-UI access.
import { describe, expect, it } from "vitest";
import type { GatewayRemoteConfig } from "../config/types.gateway.js";
import type { BotConfig } from "../config/types.bot.js";
import { resolveGatewayInteractiveSurfaceAuth } from "./auth-surface-resolution.js";

function remoteGatewayConfig(remote?: GatewayRemoteConfig): BotConfig {
  return {
    gateway: {
      mode: "remote",
      remote: {
        url: "wss://remote.example/ws",
        ...remote,
      },
    },
  };
}

describe("resolveGatewayInteractiveSurfaceAuth", () => {
  it("keeps configured local password ahead of BOT_GATEWAY_PASSWORD", async () => {
    await expect(
      resolveGatewayInteractiveSurfaceAuth({
        config: {
          gateway: {
            mode: "local",
            auth: { mode: "password", password: "config-password" }, // pragma: allowlist secret
          },
        },
        env: { BOT_GATEWAY_PASSWORD: "env-password" }, // pragma: allowlist secret
        surface: "local",
      }),
    ).resolves.toEqual({
      token: undefined,
      password: "config-password", // pragma: allowlist secret
      failureReason: undefined,
    });
  });

  it("falls back to BOT_GATEWAY_PASSWORD without configured local password", async () => {
    await expect(
      resolveGatewayInteractiveSurfaceAuth({
        config: { gateway: { mode: "local", auth: { mode: "password" } } },
        env: { BOT_GATEWAY_PASSWORD: "env-password" }, // pragma: allowlist secret
        surface: "local",
      }),
    ).resolves.toEqual({
      token: undefined,
      password: "env-password", // pragma: allowlist secret
      failureReason: undefined,
    });
  });

  it("uses BOT_GATEWAY_TOKEN as remote interactive fallback", async () => {
    await expect(
      resolveGatewayInteractiveSurfaceAuth({
        config: remoteGatewayConfig(),
        env: {
          BOT_GATEWAY_TOKEN: "env-token",
        },
        surface: "remote",
      }),
    ).resolves.toEqual({
      token: "env-token",
      password: undefined,
    });
  });

  it("keeps configured remote token ahead of BOT_GATEWAY_TOKEN", async () => {
    await expect(
      resolveGatewayInteractiveSurfaceAuth({
        config: remoteGatewayConfig({ token: "remote-token" }),
        env: {
          BOT_GATEWAY_TOKEN: "env-token",
        },
        surface: "remote",
      }),
    ).resolves.toEqual({
      token: "remote-token",
      password: undefined,
    });
  });

  it("falls back to BOT_GATEWAY_TOKEN when the remote token ref is unresolved", async () => {
    await expect(
      resolveGatewayInteractiveSurfaceAuth({
        config: {
          ...remoteGatewayConfig({
            token: { source: "env", provider: "default", id: "MISSING_REMOTE_TOKEN" },
          }),
        },
        env: {
          BOT_GATEWAY_TOKEN: "env-token",
        },
        surface: "remote",
      }),
    ).resolves.toEqual({
      token: "env-token",
      password: undefined,
    });
  });
});
