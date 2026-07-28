import {
  resolveExecApprovalsFromFile,
  type ExecApprovalsFile,
} from "bot/plugin-sdk/exec-approvals-runtime";
import { normalizeAgentId } from "bot/plugin-sdk/routing";
import type {
  CodexAppServerApprovalPolicy,
  CodexAppServerApprovalsReviewer,
  CodexAppServerDefaultPolicy,
  CodexAppServerPolicyMode,
  CodexAppServerSandboxMode,
  BotExecApprovalFloorsForCodexAppServer,
  BotExecAsk,
  BotExecMode,
  BotExecPolicy,
  BotExecPolicyForCodexAppServer,
  BotExecSecurity,
} from "./config-contracts.js";
import { readExecAsk, readExecSecurity, readRecord } from "./config-utils.js";

export function selectForcedPromptingSandbox(params: {
  configuredSandbox?: CodexAppServerSandboxMode;
  defaultSandbox?: CodexAppServerSandboxMode;
}): CodexAppServerSandboxMode {
  if (params.configuredSandbox === "read-only" || params.defaultSandbox === "read-only") {
    return "read-only";
  }
  return params.defaultSandbox ?? "workspace-write";
}

export function selectForcedDangerFullAccessSandbox(params: {
  configuredSandbox?: CodexAppServerSandboxMode;
  defaultPolicy: CodexAppServerDefaultPolicy | undefined;
  botSandboxActive: boolean;
}): CodexAppServerSandboxMode {
  if (params.configuredSandbox === "read-only") {
    return "read-only";
  }
  if (params.defaultPolicy?.dangerFullAccessAllowed === false) {
    if (params.botSandboxActive) {
      return params.defaultPolicy.sandbox ?? "workspace-write";
    }
    throw new Error(
      "legacy full exec security with ask requires Codex app-server danger-full-access",
    );
  }
  return "danger-full-access";
}

export function selectGuardianSandbox(
  allowedSandboxModes: Set<CodexAppServerSandboxMode> | undefined,
): CodexAppServerSandboxMode {
  if (allowedSandboxModes === undefined || allowedSandboxModes.has("workspace-write")) {
    return "workspace-write";
  }
  if (allowedSandboxModes.has("read-only")) {
    return "read-only";
  }
  if (allowedSandboxModes.has("danger-full-access")) {
    return "danger-full-access";
  }
  return "workspace-write";
}

export function resolveApprovalPolicy(value: unknown): CodexAppServerApprovalPolicy | undefined {
  if (value === "on-failure") {
    return "on-request";
  }
  return value === "on-request" || value === "untrusted" || value === "never" ? value : undefined;
}

export function resolveSandbox(value: unknown): CodexAppServerSandboxMode | undefined {
  return value === "read-only" || value === "workspace-write" || value === "danger-full-access"
    ? value
    : undefined;
}

export function resolveApprovalsReviewer(
  value: unknown,
): CodexAppServerApprovalsReviewer | undefined {
  return value === "auto_review" || value === "guardian_subagent" || value === "user"
    ? value
    : undefined;
}

function resolveBotExecPolicyFromConfig(params: {
  config?: unknown;
  agentId?: string;
}): BotExecPolicy {
  const root = readRecord(params.config);
  const globalExec = readRecord(readRecord(root?.tools)?.exec);
  const globalPolicy = applyBotExecPolicyLayer(createDefaultBotExecPolicy(), globalExec);
  const agentId = params.agentId?.trim();
  if (!agentId) {
    return globalPolicy;
  }
  const agents = readRecord(root?.agents);
  const agentList = Array.isArray(agents?.list) ? agents.list : [];
  const normalizedAgentId = normalizeAgentId(agentId);
  const agentEntry = agentList.find((entry) => {
    const id = readRecord(entry)?.id;
    return typeof id === "string" && normalizeAgentId(id) === normalizedAgentId;
  });
  const agentExec = readRecord(readRecord(readRecord(agentEntry)?.tools)?.exec);
  return applyBotExecPolicyLayer(globalPolicy, agentExec);
}

export function resolveBotExecPolicyForCodexAppServer(params: {
  execOverrides?: {
    security?: unknown;
    ask?: unknown;
  };
  approvals?: ExecApprovalsFile;
  config?: unknown;
  agentId?: string;
}): BotExecPolicyForCodexAppServer {
  const basePolicy = resolveBotExecPolicyFromConfig({
    config: params.config,
    agentId: params.agentId,
  });
  const overridePolicy = applyBotExecPolicyLayer(basePolicy, params.execOverrides);
  const approvalFloors = resolveBotExecApprovalFloorsForCodexAppServer({
    approvals: params.approvals,
    agentId: params.agentId,
    policy: overridePolicy,
  });
  return applyBotExecApprovalFloors(overridePolicy, approvalFloors);
}

export function resolveEffectiveBotExecModeForCodexAppServer(params: {
  execMode?: BotExecMode;
  execPolicy?: BotExecPolicyForCodexAppServer;
}): BotExecMode | undefined {
  if (params.execPolicy?.touched === true) {
    return params.execPolicy.mode;
  }
  return params.execMode;
}

export function resolveCodexPolicyModeForBotExecMode(
  mode: BotExecMode | undefined,
): CodexAppServerPolicyMode | undefined {
  if (!mode || mode === "full") {
    return undefined;
  }
  return "guardian";
}

export function assertCodexAppServerAllowedForBotExecMode(
  mode: BotExecMode | undefined,
): void {
  if (mode === "deny" || mode === "allowlist") {
    throw new Error(
      `Codex app-server local execution is not available when tools.exec.mode=${mode}`,
    );
  }
}

function createDefaultBotExecPolicy(): BotExecPolicy {
  return {
    security: "full",
    ask: "off",
    touched: false,
  };
}

function applyBotExecPolicyLayer(
  base: BotExecPolicy,
  exec?: { mode?: unknown; security?: unknown; ask?: unknown },
): BotExecPolicy {
  if (!exec) {
    return base;
  }
  const mode = readExecMode(exec.mode);
  if (mode !== undefined) {
    return {
      ...resolveBotExecPolicyForMode(mode),
      touched: true,
    };
  }
  const security = readExecSecurity(exec.security);
  const ask = readExecAsk(exec.ask);
  if (security === undefined && ask === undefined) {
    return base;
  }
  const nextSecurity = security ?? base.security;
  const nextAsk = ask ?? base.ask;
  return {
    mode: resolveBotExecModeFromPolicy({ security: nextSecurity, ask: nextAsk }),
    security: nextSecurity,
    ask: nextAsk,
    touched: true,
  };
}

function resolveBotExecApprovalFloorsForCodexAppServer(params: {
  approvals?: ExecApprovalsFile;
  agentId?: string;
  policy: BotExecPolicy;
}): BotExecApprovalFloorsForCodexAppServer | undefined {
  if (!params.approvals) {
    return undefined;
  }
  return resolveExecApprovalsFromFile({
    file: params.approvals,
    agentId: params.agentId,
    overrides: {
      security: params.policy.security,
      ask: params.policy.ask,
    },
  }).agent;
}

function applyBotExecApprovalFloors(
  base: BotExecPolicy,
  approvalFloors?: BotExecApprovalFloorsForCodexAppServer,
): BotExecPolicy {
  if (!approvalFloors) {
    return base;
  }
  const nextSecurity = approvalFloors.security
    ? minBotExecSecurity(base.security, approvalFloors.security)
    : base.security;
  const nextAsk = approvalFloors.ask ? maxBotExecAsk(base.ask, approvalFloors.ask) : base.ask;
  if (nextSecurity === base.security && nextAsk === base.ask) {
    return base;
  }
  return {
    mode: resolveBotExecModeFromPolicy({ security: nextSecurity, ask: nextAsk }),
    security: nextSecurity,
    ask: nextAsk,
    touched: true,
  };
}

function resolveBotExecPolicyForMode(
  mode: BotExecMode,
): Omit<BotExecPolicy, "touched"> {
  switch (mode) {
    case "deny":
      return { mode, security: "deny", ask: "off" };
    case "allowlist":
      return { mode, security: "allowlist", ask: "off" };
    case "ask":
    case "auto":
      return { mode, security: "allowlist", ask: "on-miss" };
    case "full":
      return { mode, security: "full", ask: "off" };
  }
  const exhaustiveMode: never = mode;
  return exhaustiveMode;
}

function resolveBotExecModeFromPolicy(params: {
  security: BotExecSecurity;
  ask: BotExecAsk;
}): BotExecMode {
  if (params.security === "deny") {
    return "deny";
  }
  if (params.security === "allowlist" && params.ask === "off") {
    return "allowlist";
  }
  if (params.security === "full" && params.ask !== "always") {
    return "full";
  }
  return "ask";
}

function minBotExecSecurity(
  left: BotExecSecurity,
  right: BotExecSecurity,
): BotExecSecurity {
  const order: Record<BotExecSecurity, number> = { deny: 0, allowlist: 1, full: 2 };
  return order[left] <= order[right] ? left : right;
}

function maxBotExecAsk(left: BotExecAsk, right: BotExecAsk): BotExecAsk {
  const order: Record<BotExecAsk, number> = { off: 0, "on-miss": 1, always: 2 };
  return order[left] >= order[right] ? left : right;
}

function readExecMode(value: unknown): BotExecMode | undefined {
  return value === "deny" ||
    value === "allowlist" ||
    value === "ask" ||
    value === "auto" ||
    value === "full"
    ? value
    : undefined;
}
