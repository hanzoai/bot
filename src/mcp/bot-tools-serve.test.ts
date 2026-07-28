// Bot MCP tools tests cover core tool server startup and registration.
import { afterEach, describe, expect, it, vi } from "vitest";
import { hashSystemAgentOperation } from "../agents/tools/system-agent-tool.js";
import {
  buildSystemAgentToolsMcpServerConfig,
  BOT_TOOLS_MCP_SYSTEM_AGENT_APPROVAL_ARMED_ENV,
  BOT_TOOLS_MCP_SYSTEM_AGENT_PROPOSAL_ENV,
  BOT_TOOLS_MCP_SYSTEM_AGENT_SURFACE_ENV,
  BOT_TOOLS_MCP_TOOLS_ENV,
  resolveBotToolsMcpSystemAgentSurface,
  resolveBotToolsMcpToolSelection,
} from "./bot-tools-serve-config.js";
import {
  BOT_TOOLS_MCP_AGENT_SESSION_KEY_ENV,
  resolveBotToolsForMcp,
  resolveBotToolsMcpAgentSessionKey,
} from "./bot-tools-serve.js";
import { createPluginToolsMcpHandlers } from "./plugin-tools-handlers.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Bot tools MCP server", () => {
  it("exposes cron", async () => {
    const handlers = createPluginToolsMcpHandlers(
      resolveBotToolsForMcp({ agentSessionKey: "agent:worker:main" }),
    );

    const listed = await handlers.listTools();
    expect(listed.tools.map((tool) => tool.name)).toContain("cron");
  });

  it("requires the managed bridge to pass a real agent session key", () => {
    expect(() => resolveBotToolsForMcp({ agentSessionKey: "" })).toThrow(
      BOT_TOOLS_MCP_AGENT_SESSION_KEY_ENV,
    );
  });

  it("reads the managed bridge agent session key from env", () => {
    expect(
      resolveBotToolsMcpAgentSessionKey({
        [BOT_TOOLS_MCP_AGENT_SESSION_KEY_ENV]: " agent:worker:main ",
      }),
    ).toBe("agent:worker:main");
  });

  it("serves the ring-zero bot tool without an agent session key", async () => {
    const handlers = createPluginToolsMcpHandlers(
      resolveBotToolsForMcp({ tools: ["bot"], systemAgentSurface: "cli" }),
    );

    const listed = await handlers.listTools();
    expect(listed.tools.map((tool) => tool.name)).toEqual(["bot"]);
  });

  it("returns approved CLI MCP mutations to the host instead of applying them", async () => {
    const operation = { kind: "config-set", path: "gateway.port", value: "19001" } as const;
    vi.stubEnv(BOT_TOOLS_MCP_SYSTEM_AGENT_APPROVAL_ARMED_ENV, "1");
    vi.stubEnv(BOT_TOOLS_MCP_SYSTEM_AGENT_PROPOSAL_ENV, hashSystemAgentOperation(operation));
    const handlers = createPluginToolsMcpHandlers(
      resolveBotToolsForMcp({ tools: ["bot"], systemAgentSurface: "cli" }),
    );

    const result = await handlers.callTool({
      name: "bot",
      arguments: {
        action: "config_set",
        path: "gateway.port",
        value: "19001",
        approved: true,
      },
    });

    expect(JSON.stringify(result)).toContain("directive:approved-operation:");
  });

  it("parses the served tool selection from env and defaults to cron", () => {
    expect(resolveBotToolsMcpToolSelection({})).toEqual(["cron"]);
    expect(
      resolveBotToolsMcpToolSelection({
        [BOT_TOOLS_MCP_TOOLS_ENV]: " bot , cron ",
      }),
    ).toEqual(["bot", "cron"]);
    expect(() =>
      resolveBotToolsMcpToolSelection({ [BOT_TOOLS_MCP_TOOLS_ENV]: "exec" }),
    ).toThrow(BOT_TOOLS_MCP_TOOLS_ENV);
  });

  it("parses the bot surface from env and defaults to cli", () => {
    expect(resolveBotToolsMcpSystemAgentSurface({})).toBe("cli");
    expect(
      resolveBotToolsMcpSystemAgentSurface({
        [BOT_TOOLS_MCP_SYSTEM_AGENT_SURFACE_ENV]: "gateway",
      }),
    ).toBe("gateway");
    expect(() =>
      resolveBotToolsMcpSystemAgentSurface({
        [BOT_TOOLS_MCP_SYSTEM_AGENT_SURFACE_ENV]: "remote",
      }),
    ).toThrow(BOT_TOOLS_MCP_SYSTEM_AGENT_SURFACE_ENV);
  });

  it("builds a bot-only stdio server config under the bot name", () => {
    const config = buildSystemAgentToolsMcpServerConfig({ surface: "gateway" });

    expect(Object.keys(config.mcpServers)).toEqual(["bot"]);
    const server = config.mcpServers.bot as {
      command?: string;
      args?: string[];
      env?: Record<string, string>;
    };
    expect(server.command).toBe(process.execPath);
    expect(server.args?.at(-1)).toMatch(/bot-tools-serve\.(js|ts)$/);
    expect(server.env).toEqual({
      [BOT_TOOLS_MCP_TOOLS_ENV]: "bot",
      [BOT_TOOLS_MCP_SYSTEM_AGENT_SURFACE_ENV]: "gateway",
    });
  });
});
