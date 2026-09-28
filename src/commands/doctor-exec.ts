import { listAgentIds, resolveAgentConfig } from "../agents/agent-scope.js";
import { resolveSandboxConfigForAgent } from "../agents/sandbox/config.js";
import type { BotConfig } from "../config/config.js";
import { note } from "../terminal/note.js";

/**
 * Exec with no sandbox is host exec, held to tools.exec.security, and with no
 * security set it is denied. Names each agent whose exec that denies: the
 * default host (sandbox) with no sandbox for some of its sessions and no
 * tools.exec.security. Cloud agents run on their node with full (pi-tools).
 */
export function execDeniedWithoutSandbox(cfg: BotConfig): string[] {
  const lines: string[] = [];
  for (const agentId of listAgentIds(cfg)) {
    if (agentId.startsWith("cloud-")) {
      continue;
    }
    const own = resolveAgentConfig(cfg, agentId)?.tools?.exec;
    const host = own?.host ?? cfg.tools?.exec?.host ?? "sandbox";
    const security = own?.security ?? cfg.tools?.exec?.security;
    const mode = resolveSandboxConfigForAgent(cfg, agentId).mode;
    if (host !== "sandbox" || security !== undefined || mode === "all") {
      continue;
    }
    const where = mode === "non-main" ? " for its main session" : "";
    lines.push(
      `- Agent ${agentId}: exec is denied: no sandbox is configured${where} and tools.exec.security is unset. Set tools.exec.security to "allowlist" or "full" to allow it.`,
    );
  }
  return lines;
}

export function noteExecWithoutSandbox(cfg: BotConfig): void {
  const lines = execDeniedWithoutSandbox(cfg);
  if (lines.length > 0) {
    note(lines.join("\n"), "Exec");
  }
}
