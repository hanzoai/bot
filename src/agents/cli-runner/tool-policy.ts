import type { CliBackendToolAvailability } from "../../plugins/cli-backend.types.js";
import { normalizeToolName } from "../tool-policy.js";

/** Transport prefix CLI harnesses use for loopback Bot MCP tool names. */
const BOT_MCP_TOOL_PREFIX = "mcp__bot__";

/** Strips the loopback MCP transport prefix so observers see gateway tool names. */
export function stripBotMcpToolPrefix(toolName: string): string {
  return toolName.startsWith(BOT_MCP_TOOL_PREFIX)
    ? toolName.slice(BOT_MCP_TOOL_PREFIX.length)
    : toolName;
}

/** Builds the public backend contract plus the shipped beta MCP-name projection. */
export function buildCliBackendToolAvailability(availability: {
  native: readonly string[];
  bot: readonly string[];
}): CliBackendToolAvailability {
  return {
    native: availability.native,
    bot: availability.bot,
    mcp: availability.bot.map((toolName) => `${BOT_MCP_TOOL_PREFIX}${toolName}`),
  };
}

/** Keeps only explicit runtime caps for backend-owned exact translation. */
export function resolveCliRuntimeToolsAllow(
  toolsAllow?: string[],
  _toolsAllowIsDefault?: boolean,
): string[] | undefined {
  if (toolsAllow === undefined) {
    return undefined;
  }
  return toolsAllow.some((toolName) => normalizeToolName(toolName) === "*")
    ? undefined
    : toolsAllow;
}
