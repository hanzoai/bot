import { afterEach, describe, expect, it } from "vitest";
import { startBrowserBridgeServer, stopBrowserBridgeServer } from "./bridge-server.js";
import { DEFAULT_BOT_BROWSER_COLOR, DEFAULT_BOT_BROWSER_PROFILE_NAME } from "./constants.js";

function buildResolvedConfig() {
  return {
    enabled: true,
    evaluateEnabled: false,
    controlPort: 0,
    cdpPortRangeStart: 18800,
    cdpPortRangeEnd: 18899,
    cdpProtocol: "http",
    cdpHost: "127.0.0.1",
    cdpIsLoopback: true,
    remoteCdpTimeoutMs: 1500,
    remoteCdpHandshakeTimeoutMs: 3000,
    color: DEFAULT_BOT_BROWSER_COLOR,
    executablePath: undefined,
    headless: true,
    noSandbox: false,
    attachOnly: true,
    defaultProfile: DEFAULT_BOT_BROWSER_PROFILE_NAME,
    profiles: {
      [DEFAULT_BOT_BROWSER_PROFILE_NAME]: {
        cdpPort: 1,
        color: DEFAULT_BOT_BROWSER_COLOR,
      },
    },
  } as const;
}

describe("startBrowserBridgeServer auth", () => {
  const servers: Array<{ stop: () => Promise<void> }> = [];

  afterEach(async () => {
    while (servers.length) {
      const s = servers.pop();
      if (s) {
        await s.stop();
      }
    }
  });

  it("rejects unauthenticated requests when authToken is set", async () => {
    const bridge = await startBrowserBridgeServer({
      resolved: buildResolvedConfig(),
      authToken: "secret-token",
    });
    servers.push({ stop: () => stopBrowserBridgeServer(bridge.server) });

    const unauth = await fetch(`${bridge.baseUrl}/`);
    expect(unauth.status).toBe(401);

    const authed = await fetch(`${bridge.baseUrl}/`, {
      headers: { Authorization: "Bearer secret-token" },
    });
    expect(authed.status).toBe(200);
  });

  it("accepts x-bot-password when authPassword is set", async () => {
    const bridge = await startBrowserBridgeServer({
      resolved: buildResolvedConfig(),
      authPassword: "secret-password",
    });
    servers.push({ stop: () => stopBrowserBridgeServer(bridge.server) });

    const unauth = await fetch(`${bridge.baseUrl}/`);
    expect(unauth.status).toBe(401);

    const authed = await fetch(`${bridge.baseUrl}/`, {
      headers: { "x-bot-password": "secret-password" },
    });
    expect(authed.status).toBe(200);
  });

  it("requires auth params", async () => {
    await expect(
      startBrowserBridgeServer({
        resolved: buildResolvedConfig(),
      }),
    ).rejects.toThrow(/requires auth/i);
  });

  it("serves noVNC bootstrap html without leaking password in Location header", async () => {
    const bridge = await startBrowserBridgeServer({
      resolved: buildResolvedConfig(),
      authToken: "secret-token",
      resolveSandboxNoVncToken: (token) => {
        if (token !== "valid-token") {
          return null;
        }
        return { noVncPort: 45678, password: "Abc123xy" };
      },
    });
    servers.push({ stop: () => stopBrowserBridgeServer(bridge.server) });

    const res = await fetch(`${bridge.baseUrl}/sandbox/novnc?token=valid-token`);
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");

    const body = await res.text();
    expect(body).toContain("window.location.replace");
    expect(body).toContain(
      "http://127.0.0.1:45678/vnc.html#autoconnect=1&resize=remote&password=Abc123xy",
    );
    expect(body).not.toContain("?password=");
  });
});
