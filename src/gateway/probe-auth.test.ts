import { describe, expect, it } from "vitest";
import type { BotConfig } from "../config/config.js";
import { resolveGatewayProbeAuth } from "./probe-auth.js";

describe("resolveGatewayProbeAuth", () => {
  it("returns probe auth credentials when available", () => {
    const result = resolveGatewayProbeAuth({
      cfg: {
        gateway: {
          auth: {
            token: "token-value",
          },
        },
      } as BotConfig,
      mode: "local",
      env: {} as NodeJS.ProcessEnv,
    });

    expect(result).toEqual({
      token: "token-value",
      password: undefined,
    });
  });

  it("returns empty credentials when token SecretRef is unresolved", () => {
    const result = resolveGatewayProbeAuth({
      cfg: {
        gateway: {
          auth: {
            mode: "token",
            token: { source: "env", provider: "default", id: "MISSING_GATEWAY_TOKEN" },
          },
        },
        secrets: {
          providers: {
            default: { source: "env" },
          },
        },
      } as BotConfig,
      mode: "local",
      env: {} as NodeJS.ProcessEnv,
    });

    // SecretRef objects are non-strings, so trimToUndefined returns undefined.
    // In local mode with no env fallback, credentials resolve to empty.
    expect(result.token).toBeUndefined();
    expect(result.password).toBeUndefined();
  });

  it("ignores unresolved local token SecretRef in remote mode when remote-only auth is requested", () => {
    const result = resolveGatewayProbeAuth({
      cfg: {
        gateway: {
          mode: "remote",
          remote: {
            url: "wss://gateway.example",
          },
          auth: {
            mode: "token",
            token: { source: "env", provider: "default", id: "MISSING_LOCAL_TOKEN" },
          },
        },
        secrets: {
          providers: {
            default: { source: "env" },
          },
        },
      } as BotConfig,
      mode: "remote",
      env: {} as NodeJS.ProcessEnv,
    });

    expect(result).toEqual({
      token: undefined,
      password: undefined,
    });
  });
});
