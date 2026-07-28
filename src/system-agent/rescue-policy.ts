import { resolveAgentEntry } from "../agents/agent-scope-config.js";
// Bot rescue policy gates remote writes by owner, DM, sandbox, and YOLO posture.
import type { BotConfig } from "../config/types.bot.js";
import { resolveExecModePolicy } from "../infra/exec-approvals.js";

/**
 * Policy checks for remote Bot rescue commands.
 *
 * Rescue intentionally opens only for owner-controlled, non-sandboxed YOLO host
 * posture because remote commands can write local state.
 */
type SystemAgentRescueDecision =
  | {
      allowed: true;
      enabled: true;
      ownerDmOnly: boolean;
      pendingTtlMinutes: number;
      yolo: true;
      sandboxActive: false;
    }
  | {
      allowed: false;
      enabled: boolean;
      ownerDmOnly: boolean;
      pendingTtlMinutes: number;
      yolo: boolean;
      sandboxActive: boolean;
      reason: "disabled" | "sandbox-active" | "not-owner" | "not-direct-message";
      message: string;
    };

type SystemAgentRescuePolicyInput = {
  cfg: BotConfig;
  agentId?: string;
  senderIsOwner: boolean;
  isDirectMessage: boolean;
};

function resolveScopedExecConfig(cfg: BotConfig, agentId?: string) {
  return agentId ? resolveAgentEntry(cfg, agentId)?.tools?.exec : undefined;
}

function resolveScopedSandboxMode(
  cfg: BotConfig,
  agentId?: string,
): "off" | "non-main" | "all" {
  return (
    (agentId ? resolveAgentEntry(cfg, agentId)?.sandbox?.mode : undefined) ??
    cfg.agents?.defaults?.sandbox?.mode ??
    "off"
  );
}

function isYoloHostPosture(cfg: BotConfig, agentId?: string): boolean {
  const scopedExec = resolveScopedExecConfig(cfg, agentId);
  const globalExec = cfg.tools?.exec;
  const inherited = resolveExecModePolicy({
    mode: globalExec?.mode,
    security: globalExec?.security ?? "full",
    ask: globalExec?.ask ?? "off",
  });
  return (
    resolveExecModePolicy({
      mode: scopedExec?.mode,
      security: scopedExec?.security ?? inherited.security,
      ask: scopedExec?.ask ?? inherited.ask,
    }).mode === "full"
  );
}

/** Decide whether a message-channel rescue command is allowed for this sender/context. */
export function resolveSystemAgentRescuePolicy(
  input: SystemAgentRescuePolicyInput,
): SystemAgentRescueDecision {
  const ownerDmOnly = true;
  const pendingTtlMinutes = 15;
  const sandboxActive = resolveScopedSandboxMode(input.cfg, input.agentId) !== "off";
  const yolo = !sandboxActive && isYoloHostPosture(input.cfg, input.agentId);
  const enabled = yolo;

  if (sandboxActive) {
    return {
      allowed: false,
      enabled,
      ownerDmOnly,
      pendingTtlMinutes,
      yolo,
      sandboxActive,
      reason: "sandbox-active",
      message:
        "Bot rescue is blocked because Bot sandboxing is active. Fix the install locally or disable sandboxing before using remote rescue.",
    };
  }
  if (!enabled) {
    return {
      allowed: false,
      enabled,
      ownerDmOnly,
      pendingTtlMinutes,
      yolo,
      sandboxActive,
      reason: "disabled",
      message: "Bot rescue requires YOLO host posture with sandboxing off.",
    };
  }
  if (!input.senderIsOwner) {
    return {
      allowed: false,
      enabled,
      ownerDmOnly,
      pendingTtlMinutes,
      yolo,
      sandboxActive,
      reason: "not-owner",
      message: "Bot rescue only accepts commands from an Bot owner.",
    };
  }
  if (ownerDmOnly && !input.isDirectMessage) {
    return {
      allowed: false,
      enabled,
      ownerDmOnly,
      pendingTtlMinutes,
      yolo,
      sandboxActive,
      reason: "not-direct-message",
      message: "Bot rescue is restricted to owner DMs by default.",
    };
  }
  return {
    allowed: true,
    enabled: true,
    ownerDmOnly,
    pendingTtlMinutes,
    yolo: true,
    sandboxActive: false,
  };
}
