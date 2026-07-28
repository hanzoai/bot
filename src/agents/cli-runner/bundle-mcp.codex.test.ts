/** Tests Codex CLI bundle-MCP config override generation. */
import { describe, expect, it } from "vitest";
import { prepareCliBundleMcpConfig } from "./bundle-mcp.js";

describe("prepareCliBundleMcpConfig codex", () => {
  it("injects codex MCP config overrides with env-backed loopback headers", async () => {
    const prepared = await prepareCliBundleMcpConfig({
      enabled: true,
      mode: "codex-config-overrides",
      backend: {
        command: "codex",
        args: ["exec", "--json"],
        resumeArgs: ["exec", "resume", "{sessionId}"],
      },
      workspaceDir: "/tmp/bot-bundle-mcp-codex",
      config: { plugins: { enabled: false } },
      additionalConfig: {
        mcpServers: {
          bot: {
            type: "http",
            url: "http://127.0.0.1:23119/mcp",
            headers: {
              Authorization: "Bearer ${BOT_MCP_TOKEN}",
              "x-session-key": "${BOT_MCP_SESSION_KEY}",
              "x-bot-cli-capture-key": "${BOT_MCP_CLI_CAPTURE_KEY}",
            },
          },
        },
      },
    });

    // Codex consumes MCP config through TOML-like -c overrides instead of a
    // generated config file.
    expect(prepared.backend.args).toEqual([
      "exec",
      "--json",
      "-c",
      'mcp_servers={ bot = { url = "http://127.0.0.1:23119/mcp", default_tools_approval_mode = "approve", bearer_token_env_var = "BOT_MCP_TOKEN", env_http_headers = { x-session-key = "BOT_MCP_SESSION_KEY", x-bot-cli-capture-key = "BOT_MCP_CLI_CAPTURE_KEY" } } }',
    ]);
    expect(prepared.backend.resumeArgs).toEqual([
      "exec",
      "resume",
      "{sessionId}",
      "-c",
      'mcp_servers={ bot = { url = "http://127.0.0.1:23119/mcp", default_tools_approval_mode = "approve", bearer_token_env_var = "BOT_MCP_TOKEN", env_http_headers = { x-session-key = "BOT_MCP_SESSION_KEY", x-bot-cli-capture-key = "BOT_MCP_CLI_CAPTURE_KEY" } } }',
    ]);
    expect(prepared.cleanup).toBeUndefined();
  });
});
