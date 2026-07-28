export const BOT_TOOLS_MCP_AGENT_SESSION_KEY_ENV = "BOT_TOOLS_MCP_AGENT_SESSION_KEY";

export function resolveToolsMcpAgentSessionKey(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  return env[BOT_TOOLS_MCP_AGENT_SESSION_KEY_ENV]?.trim() || undefined;
}
