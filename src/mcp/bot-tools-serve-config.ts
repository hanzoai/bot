/**
 * Shared contract between the bot-tools MCP stdio entry and the callers
 * that inject it into CLI harness runs. Keep this module free of MCP SDK and
 * tool-runtime imports so CLI-runner prepare paths can build server configs
 * without loading the server.
 */
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { SystemAgentToolOptions } from "../agents/tools/system-agent-tool.js";
import { resolveBotPackageRootSync } from "../infra/bot-root.js";
import type { BundleMcpConfig } from "../plugins/bundle-mcp.js";

export const BOT_TOOLS_MCP_TOOLS_ENV = "BOT_TOOLS_MCP_TOOLS";
export const BOT_TOOLS_MCP_SYSTEM_AGENT_SURFACE_ENV =
  "BOT_TOOLS_MCP_SYSTEM_AGENT_SURFACE";
export const BOT_TOOLS_MCP_SYSTEM_AGENT_APPROVAL_ARMED_ENV =
  "BOT_TOOLS_MCP_SYSTEM_AGENT_APPROVAL_ARMED";
export const BOT_TOOLS_MCP_SYSTEM_AGENT_PROPOSAL_ENV =
  "BOT_TOOLS_MCP_SYSTEM_AGENT_PROPOSAL";

const BOT_TOOLS_MCP_TOOL_IDS = ["cron", "bot"] as const;
export type BotToolsMcpToolId = (typeof BOT_TOOLS_MCP_TOOL_IDS)[number];

function isBotToolsMcpToolId(value: string): value is BotToolsMcpToolId {
  return (BOT_TOOLS_MCP_TOOL_IDS as readonly string[]).includes(value);
}

/** Parse the served tool selection; the default stays cron for acpx bridges. */
export function resolveBotToolsMcpToolSelection(
  env: NodeJS.ProcessEnv = process.env,
): BotToolsMcpToolId[] {
  const raw = env[BOT_TOOLS_MCP_TOOLS_ENV]?.trim();
  if (!raw) {
    return ["cron"];
  }
  const entries = raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  const selection = entries.filter(isBotToolsMcpToolId);
  if (selection.length === 0 || selection.length !== entries.length) {
    throw new Error(
      `${BOT_TOOLS_MCP_TOOLS_ENV} must be a comma list of: ${BOT_TOOLS_MCP_TOOL_IDS.join(", ")}`,
    );
  }
  return selection;
}

/** Parse the Bot surface for served bot tools; defaults to cli. */
export function resolveBotToolsMcpSystemAgentSurface(
  env: NodeJS.ProcessEnv = process.env,
): SystemAgentToolOptions["surface"] {
  const raw = env[BOT_TOOLS_MCP_SYSTEM_AGENT_SURFACE_ENV]?.trim();
  if (!raw || raw === "cli") {
    return "cli";
  }
  if (raw === "gateway") {
    return "gateway";
  }
  throw new Error(`${BOT_TOOLS_MCP_SYSTEM_AGENT_SURFACE_ENV} must be "cli" or "gateway"`);
}

/**
 * Reconstruct per-turn approval state for the served bot tool. The
 * stdio server runs out of process, so the host passes the armed bit and the
 * pending proposal hash through env; the host mirrors transitions back from
 * tool events (see mirrorSystemAgentProposalFromToolEvents in agent-turn.ts).
 */
export function resolveBotToolsMcpSystemAgentApproval(env: NodeJS.ProcessEnv = process.env): {
  approvalArmed: boolean;
  proposalRef: { current?: string };
} {
  const pendingProposal = env[BOT_TOOLS_MCP_SYSTEM_AGENT_PROPOSAL_ENV]?.trim();
  return {
    approvalArmed: env[BOT_TOOLS_MCP_SYSTEM_AGENT_APPROVAL_ARMED_ENV]?.trim() === "1",
    proposalRef: pendingProposal ? { current: pendingProposal } : {},
  };
}

function resolveTsxImportSpecifier(): string {
  try {
    return createRequire(import.meta.url).resolve("tsx");
  } catch {
    return "tsx";
  }
}

function resolveBotToolsServeCommand(): { command: string; args: string[] } {
  const packageRoot = resolveBotPackageRootSync({
    argv1: process.argv[1],
    moduleUrl: import.meta.url,
    cwd: process.cwd(),
  });
  if (!packageRoot) {
    throw new Error("bot-tools MCP: could not resolve the Bot package root");
  }
  const distEntry = path.join(packageRoot, "dist", "mcp", "bot-tools-serve.js");
  if (fs.existsSync(distEntry)) {
    return { command: process.execPath, args: [distEntry] };
  }
  const sourceEntry = path.join(packageRoot, "src", "mcp", "bot-tools-serve.ts");
  if (!fs.existsSync(sourceEntry)) {
    throw new Error(`bot-tools MCP: no serve entry under ${packageRoot}`);
  }
  // Bun executes TypeScript entries directly; Node source checkouts need tsx.
  if (process.versions.bun) {
    return { command: process.execPath, args: [sourceEntry] };
  }
  return {
    command: process.execPath,
    args: ["--import", resolveTsxImportSpecifier(), sourceEntry],
  };
}

/**
 * Bot CLI-harness runs get exactly one MCP server: this stdio entry
 * serving the ring-zero bot tool. The server keeps the "bot" name
 * so backend tool pre-approvals (e.g. Claude's --allowedTools mcp__bot__*)
 * apply without per-backend argument surgery.
 */
export function buildSystemAgentToolsMcpServerConfig(
  options: SystemAgentToolOptions,
): BundleMcpConfig {
  const entry = resolveBotToolsServeCommand();
  const pendingProposal = options.proposalRef?.current;
  return {
    mcpServers: {
      bot: {
        command: entry.command,
        args: entry.args,
        env: {
          [BOT_TOOLS_MCP_TOOLS_ENV]: "bot" satisfies BotToolsMcpToolId,
          [BOT_TOOLS_MCP_SYSTEM_AGENT_SURFACE_ENV]: options.surface,
          // Per-turn approval state travels with the per-run MCP config; the
          // host mirrors proposal transitions back from tool events.
          ...(options.approvalArmed === true
            ? { [BOT_TOOLS_MCP_SYSTEM_AGENT_APPROVAL_ARMED_ENV]: "1" }
            : {}),
          ...(pendingProposal
            ? { [BOT_TOOLS_MCP_SYSTEM_AGENT_PROPOSAL_ENV]: pendingProposal }
            : {}),
        },
      },
    },
  };
}
