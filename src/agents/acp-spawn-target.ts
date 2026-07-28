import type { BotConfig } from "../config/types.bot.js";
import { normalizeOptionalAgentId } from "../routing/session-key.js";
import { listAgentEntries } from "./agent-scope-config.js";
import { listAgentIds } from "./agent-scope.js";

export function resolveTargetAcpAgentId(params: {
  requestedAgentId?: string;
  cfg: BotConfig;
}): { ok: true; agentId: string; configAgentId?: string } | { ok: false; error: string } {
  const requested = normalizeOptionalAgentId(params.requestedAgentId);
  if (requested) {
    const configuredAgent = listAgentEntries(params.cfg).find(
      (agent) => normalizeOptionalAgentId(agent.id) === requested,
    );
    if (configuredAgent?.runtime?.type === "acp") {
      return {
        ok: true,
        agentId: normalizeOptionalAgentId(configuredAgent.runtime.acp?.agent) ?? requested,
        configAgentId: requested,
      };
    }
    if (configuredAgent && !isExplicitlyAllowedAcpAgent(params.cfg, requested)) {
      return {
        ok: false,
        error:
          `agentId "${requested}" is an Bot config agent, not an ACP harness. ` +
          'Use runtime="subagent" or omit runtime for Bot config agents. ' +
          'Use runtime="acp" only with external ACP harness ids such as codex, claude, droid, gemini, or opencode, or configure agents.entries.*.runtime.type="acp" with runtime.acp.agent.',
      };
    }
    return {
      ok: true,
      agentId: requested,
      ...(configuredAgent ? { configAgentId: requested } : {}),
    };
  }

  const configuredDefault = normalizeOptionalAgentId(params.cfg.acp?.defaultAgent);
  if (configuredDefault) {
    return { ok: true, agentId: configuredDefault };
  }

  return {
    ok: false,
    error:
      "ACP target agent is not configured. Pass `agentId` in `sessions_spawn` or set `acp.defaultAgent` in config.",
  };
}

function isExplicitlyAllowedAcpAgent(cfg: BotConfig, agentId: string): boolean {
  return (cfg.acp?.allowedAgents ?? []).some((entry) => {
    if (entry.trim() === "*") {
      return true;
    }
    const normalized = normalizeOptionalAgentId(entry);
    return normalized === agentId;
  });
}

export function resolveConfiguredAcpSubagentTargetIds(cfg: BotConfig): string[] {
  const ids = new Set<string>(listAgentIds(cfg));
  for (const agent of listAgentEntries(cfg)) {
    if (agent.runtime?.type !== "acp") {
      continue;
    }
    const acpAgent = normalizeOptionalAgentId(agent.runtime.acp?.agent);
    if (acpAgent) {
      ids.add(acpAgent);
    }
  }
  const defaultAgent = normalizeOptionalAgentId(cfg.acp?.defaultAgent);
  if (defaultAgent) {
    ids.add(defaultAgent);
  }
  for (const entry of cfg.acp?.allowedAgents ?? []) {
    if (entry.trim() === "*") {
      continue;
    }
    const id = normalizeOptionalAgentId(entry);
    if (id) {
      ids.add(id);
    }
  }
  return Array.from(ids);
}
