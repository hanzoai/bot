import fs from "node:fs/promises";
import path from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import { CONFIG_PATH_CLAWDBOT } from "../config/config.js";
import { installGatewayTestHooks, getFreePort, startGatewayServer } from "./test-helpers.server.js";
import { testState } from "./test-helpers.mocks.js";

installGatewayTestHooks({ scope: "suite" });

beforeEach(() => {
  // Ensure these tests are not affected by host env vars.
  delete process.env.CLAWDBOT_GATEWAY_TOKEN;
  delete process.env.CLAWDBOT_GATEWAY_PASSWORD;
});

describe("POST /tools/invoke", () => {
  it("invokes a tool and returns {ok:true,result}", async () => {
    // Allow the sessions_list tool for main agent.
    testState.agentsConfig = {
      list: [
        {
          id: "main",
          tools: {
            allow: ["sessions_list"],
          },
        },
      ],
    } as any;

    const port = await getFreePort();
    const server = await startGatewayServer(port, {
      bind: "loopback",
    });

    const res = await fetch(`http://127.0.0.1:${port}/tools/invoke`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tool: "sessions_list", action: "json", args: {}, sessionKey: "main" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body).toHaveProperty("result");

    await server.close();
  });

  it("supports tools.alsoAllow as additive allowlist (profile stage)", async () => {
    // No explicit tool allowlist; rely on profile + alsoAllow.
    testState.agentsConfig = {
      list: [{ id: "main" }],
    } as any;

    // minimal profile does NOT include sessions_list, but alsoAllow should.
    await fs.mkdir(path.dirname(CONFIG_PATH_CLAWDBOT), { recursive: true });
    await fs.writeFile(
      CONFIG_PATH_CLAWDBOT,
      JSON.stringify({ tools: { profile: "minimal", alsoAllow: ["sessions_list"] } }, null, 2),
      "utf-8",
    );

    const port = await getFreePort();
    const server = await startGatewayServer(port, { bind: "loopback" });

    const res = await fetch(`http://127.0.0.1:${port}/tools/invoke`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tool: "sessions_list", action: "json", args: {}, sessionKey: "main" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);

    await server.close();
  });

  it("supports tools.alsoAllow without allow/profile (implicit allow-all)", async () => {
    testState.agentsConfig = {
      list: [{ id: "main" }],
    } as any;

    await fs.mkdir(path.dirname(CONFIG_PATH_CLAWDBOT), { recursive: true });
    await fs.writeFile(
      CONFIG_PATH_CLAWDBOT,
      JSON.stringify({ tools: { alsoAllow: ["sessions_list"] } }, null, 2),
      "utf-8",
    );

    const port = await getFreePort();
    const server = await startGatewayServer(port, { bind: "loopback" });

    const res = await fetch(`http://127.0.0.1:${port}/tools/invoke`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tool: "sessions_list", action: "json", args: {}, sessionKey: "main" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);

    await server.close();
  });

  it("accepts password auth when bearer token matches", async () => {
    testState.agentsConfig = {
      list: [
        {
          id: "main",
          tools: {
            allow: ["sessions_list"],
          },
        },
      ],
    } as any;

    const port = await getFreePort();
    const server = await startGatewayServer(port, {
      bind: "loopback",
      auth: { mode: "password", password: "secret" },
    });

    const res = await fetch(`http://127.0.0.1:${port}/tools/invoke`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer secret",
      },
      body: JSON.stringify({ tool: "sessions_list", action: "json", args: {}, sessionKey: "main" }),
    });

    expect(res.status).toBe(200);

    await server.close();
  });

  it("rejects unauthorized when auth mode is token and header is missing", async () => {
    testState.agentsConfig = {
      list: [
        {
          id: "main",
          tools: {
            allow: ["sessions_list"],
          },
        },
      ],
    } as any;

    const port = await getFreePort();
    const server = await startGatewayServer(port, {
      bind: "loopback",
      auth: { mode: "token", token: "t" },
    });

    const res = await fetch(`http://127.0.0.1:${port}/tools/invoke`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tool: "sessions_list", action: "json", args: {}, sessionKey: "main" }),
    });

    expect(res.status).toBe(401);

    await server.close();
  });

  it("returns 404 when tool is not allowlisted", async () => {
    testState.agentsConfig = {
      list: [
        {
          id: "main",
          tools: {
            deny: ["sessions_list"],
          },
        },
      ],
    } as any;

    const port = await getFreePort();
    const server = await startGatewayServer(port, { bind: "loopback" });

    const res = await fetch(`http://127.0.0.1:${port}/tools/invoke`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tool: "sessions_list", action: "json", args: {}, sessionKey: "main" }),
    });

    expect(res.status).toBe(404);

    await server.close();
  });

  it("respects tools.profile allowlist", async () => {
    testState.agentsConfig = {
      list: [
        {
          id: "main",
          tools: {
            allow: ["sessions_list"],
          },
        },
      ],
    } as any;

    const { writeConfigFile } = await import("../config/config.js");
    await writeConfigFile({
      tools: { profile: "minimal" },
    } as any);

    const port = await getFreePort();
    const server = await startGatewayServer(port, { bind: "loopback" });

    const res = await fetch(`http://127.0.0.1:${port}/tools/invoke`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tool: "sessions_list", action: "json", args: {}, sessionKey: "main" }),
    });

    expect(res.status).toBe(404);

    await server.close();
  });

  it("uses the configured main session key when sessionKey is missing or main", async () => {
    testState.agentsConfig = {
      list: [
        {
          id: "main",
          tools: {
            deny: ["sessions_list"],
          },
        },
        {
          id: "ops",
          default: true,
          tools: {
            allow: ["sessions_list"],
          },
        },
      ],
    } as any;
    testState.sessionConfig = { mainKey: "primary" };

    const port = await getFreePort();
    const server = await startGatewayServer(port, { bind: "loopback" });

    const payload = { tool: "sessions_list", action: "json", args: {} };

    const resDefault = await fetch(`http://127.0.0.1:${port}/tools/invoke`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    expect(resDefault.status).toBe(200);

    const resMain = await fetch(`http://127.0.0.1:${port}/tools/invoke`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...payload, sessionKey: "main" }),
    });
    expect(resMain.status).toBe(200);

    await server.close();
  });
});
