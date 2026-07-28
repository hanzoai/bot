/**
 * Standalone MCP server for selected built-in Bot tools.
 *
 * Run via: node --import tsx src/mcp/bot-tools-serve.ts
 * Or: bun src/mcp/bot-tools-serve.ts
 */
import { pathToFileURL } from "node:url";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import type { AnyAgentTool } from "../agents/tools/common.js";
import { createCronTool } from "../agents/tools/cron-tool.js";
import { createSystemAgentTool } from "../agents/tools/system-agent-tool.js";
import type { SystemAgentToolOptions } from "../agents/tools/system-agent-tool.js";
import { formatErrorMessage } from "../infra/errors.js";
import {
  BOT_TOOLS_MCP_AGENT_SESSION_KEY_ENV,
  resolveToolsMcpAgentSessionKey,
} from "./agent-session-env.js";
import {
  resolveBotToolsMcpSystemAgentApproval,
  resolveBotToolsMcpSystemAgentSurface,
  resolveBotToolsMcpToolSelection,
  type BotToolsMcpToolId,
} from "./bot-tools-serve-config.js";
import { connectToolsMcpServerToStdio, createToolsMcpServer } from "./tools-stdio-server.js";

export {
  BOT_TOOLS_MCP_SYSTEM_AGENT_SURFACE_ENV,
  BOT_TOOLS_MCP_TOOLS_ENV,
} from "./bot-tools-serve-config.js";

export { BOT_TOOLS_MCP_AGENT_SESSION_KEY_ENV } from "./agent-session-env.js";

export function resolveBotToolsMcpAgentSessionKey(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  return resolveToolsMcpAgentSessionKey(env);
}

export function resolveBotToolsForMcp(
  params: {
    agentSessionKey?: string;
    tools?: BotToolsMcpToolId[];
    systemAgentSurface?: SystemAgentToolOptions["surface"];
  } = {},
): AnyAgentTool[] {
  const selection = params.tools ?? resolveBotToolsMcpToolSelection();
  return selection.map((tool) => {
    if (tool === "bot") {
      return createSystemAgentTool({
        surface: params.systemAgentSurface ?? resolveBotToolsMcpSystemAgentSurface(),
        ...resolveBotToolsMcpSystemAgentApproval(),
      });
    }
    const agentSessionKey = (
      params.agentSessionKey ?? resolveBotToolsMcpAgentSessionKey()
    )?.trim();
    if (!agentSessionKey) {
      throw new Error(`${BOT_TOOLS_MCP_AGENT_SESSION_KEY_ENV} is required`);
    }
    return createCronTool({ agentSessionKey, creatorToolAllowlist: [{ name: "cron" }] });
  });
}

function createBotToolsMcpServer(
  params: {
    tools?: AnyAgentTool[];
  } = {},
): Server {
  const tools = params.tools ?? resolveBotToolsForMcp();
  return createToolsMcpServer({ name: "bot-tools", tools });
}

async function serveBotToolsMcp(): Promise<void> {
  const server = createBotToolsMcpServer();
  await connectToolsMcpServerToStdio(server);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  serveBotToolsMcp().catch((err: unknown) => {
    process.stderr.write(`bot-tools-serve: ${formatErrorMessage(err)}\n`);
    process.exit(1);
  });
}
