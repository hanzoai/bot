import type { IncomingMessage, ServerResponse } from "node:http";
import type { AuthRateLimiter } from "./auth-rate-limit.js";
import { loadConfig } from "../config/config.js";
import { logWarn } from "../logger.js";
import { authorizeHttpGatewayConnect, type ResolvedGatewayAuth } from "./auth.js";
import {
  readJsonBodyOrError,
  sendGatewayAuthFailure,
  sendInvalidRequest,
  sendJson,
  sendMethodNotAllowed,
} from "./http-common.js";
import { getBearerToken } from "./http-utils.js";
import {
  type Bot,
  type BotDID,
  type BotPlatform,
  type BotWallet,
  createAgentDID,
  createAgentWallet,
  createBot,
  deleteBot,
  getAgentDID,
  getAgentIdentityFull,
  getAgentWallet,
  getBot,
  getBotLogs,
  listBots,
  setBotStatus,
  updateBot,
} from "./bots-store.js";

const DEFAULT_BODY_BYTES = 1 * 1024 * 1024;

// ZAP contract: POST /v1/tools/call { name, args } -> { content }
type ToolsCallBody = { name?: unknown; args?: unknown };

interface TeamPreset {
  id: string;
  name: string;
  emoji: string;
  role: string;
  description: string;
}

const TEAM_PRESETS: TeamPreset[] = [
  { id: "support", name: "Support Agent", emoji: "🎧", role: "support", description: "Front-line customer support across chat channels." },
  { id: "sales", name: "Sales Agent", emoji: "💼", role: "sales", description: "Qualifies leads and answers product questions." },
  { id: "devops", name: "DevOps Agent", emoji: "🛠️", role: "devops", description: "Monitors infrastructure and runs ops playbooks." },
  { id: "research", name: "Research Agent", emoji: "🔬", role: "research", description: "Gathers and synthesizes information on demand." },
  { id: "pm", name: "Product Manager", emoji: "📋", role: "product", description: "Tracks roadmap items and triages feedback." },
];

class ToolError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function asObj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}
function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}
function strArr(v: unknown): string[] | undefined {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : undefined;
}
function reqStr(args: Record<string, unknown>, key: string): string {
  const s = str(args[key]);
  if (!s) throw new ToolError(400, `missing required arg: ${key}`);
  return s;
}

async function dispatch(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    // ── bots.* ────────────────────────────────────────────────────────────
    case "bots.list":
      return listBots(reqStr(args, "projectId"));

    case "bots.get": {
      const bot = await getBot(reqStr(args, "projectId"), reqStr(args, "botId"));
      if (!bot) throw new ToolError(404, "bot not found");
      return bot;
    }

    case "bots.create":
      return createBot(reqStr(args, "projectId"), {
        name: reqStr(args, "name"),
        platform: (str(args.platform) as BotPlatform) ?? "linux",
        region: str(args.region) ?? "us-east-1",
        channels: strArr(args.channels),
        modelsEnabled: strArr(args.modelsEnabled),
      });

    case "bots.update": {
      const bot = await updateBot(reqStr(args, "projectId"), reqStr(args, "botId"), {
        name: str(args.name),
        channels: strArr(args.channels),
        modelsEnabled: strArr(args.modelsEnabled),
      });
      if (!bot) throw new ToolError(404, "bot not found");
      return bot;
    }

    case "bots.delete": {
      const ok = await deleteBot(reqStr(args, "projectId"), reqStr(args, "botId"));
      if (!ok) throw new ToolError(404, "bot not found");
      return { ok: true };
    }

    case "bots.start": {
      const bot = await setBotStatus(reqStr(args, "projectId"), reqStr(args, "botId"), "running", "Bot started.");
      if (!bot) throw new ToolError(404, "bot not found");
      return bot;
    }

    case "bots.stop": {
      const bot = await setBotStatus(reqStr(args, "projectId"), reqStr(args, "botId"), "stopped", "Bot stopped.");
      if (!bot) throw new ToolError(404, "bot not found");
      return bot;
    }

    case "bots.restart": {
      const bot = await setBotStatus(reqStr(args, "projectId"), reqStr(args, "botId"), "running", "Bot restarted.");
      if (!bot) throw new ToolError(404, "bot not found");
      return bot;
    }

    case "bots.usage": {
      const bot = await getBot(reqStr(args, "projectId"), reqStr(args, "botId"));
      return bot?.monthlyUsage ?? { messages: 0, tokens: 0, cost: 0 };
    }

    case "bots.logs": {
      const limit = typeof args.limit === "number" ? args.limit : 100;
      return getBotLogs(reqStr(args, "projectId"), reqStr(args, "botId"), limit);
    }

    // ── team.* ────────────────────────────────────────────────────────────
    case "team.presets.list":
      return TEAM_PRESETS;

    case "team.presets.get": {
      const preset = TEAM_PRESETS.find((p) => p.id === reqStr(args, "presetId"));
      if (!preset) throw new ToolError(404, "preset not found");
      return preset;
    }

    case "team.provision": {
      const presetId = reqStr(args, "presetId");
      const preset = TEAM_PRESETS.find((p) => p.id === presetId);
      if (!preset) throw new ToolError(404, "preset not found");
      const projectId = str(args.workspace) ?? "team";
      const bot = await provisionPreset(projectId, preset);
      return { ok: true, agentId: bot.id, name: bot.name };
    }

    case "team.provision.all": {
      const projectId = str(args.workspace) ?? "team";
      const existingBots = await listBots(projectId);
      const existingNames = new Set(existingBots.map((b) => b.name));
      let created = 0;
      let existing = 0;
      for (const preset of TEAM_PRESETS) {
        if (existingNames.has(preset.name)) {
          existing += 1;
        } else {
          await provisionPreset(projectId, preset);
          created += 1;
        }
      }
      return { ok: true, created, existing, total: TEAM_PRESETS.length };
    }

    // ── agent.* (DID / wallet / identity) ──────────────────────────────────
    case "agent.did.get":
      return getAgentDID(reqStr(args, "agentId"));

    case "agent.did.create":
      return createAgentDID(reqStr(args, "agentId"), (str(args.method) as BotDID["method"]) ?? "hanzo");

    case "agent.wallet.get":
      return getAgentWallet(reqStr(args, "agentId"));

    case "agent.wallet.create":
      return createAgentWallet(reqStr(args, "agentId"), (str(args.chain) as BotWallet["chain"]) ?? "hanzo");

    case "agent.identity.full":
      return getAgentIdentityFull(reqStr(args, "agentId"));

    default:
      throw new ToolError(404, `unknown tool: ${name}`);
  }
}

async function provisionPreset(projectId: string, preset: TeamPreset): Promise<Bot> {
  return createBot(projectId, {
    name: preset.name,
    platform: "linux",
    region: "us-east-1",
    channels: ["web"],
    modelsEnabled: [],
  });
}

export async function handleBotsCallHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  opts: {
    auth: ResolvedGatewayAuth;
    maxBodyBytes?: number;
    trustedProxies?: string[];
    allowRealIpFallback?: boolean;
    rateLimiter?: AuthRateLimiter;
  },
): Promise<boolean> {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  if (url.pathname !== "/v1/tools/call") {
    return false;
  }
  if (req.method !== "POST") {
    sendMethodNotAllowed(res, "POST");
    return true;
  }

  const cfg = loadConfig();
  const token = getBearerToken(req);
  const authResult = await authorizeHttpGatewayConnect({
    auth: opts.auth,
    connectAuth: token ? { token, password: token } : null,
    req,
    trustedProxies: opts.trustedProxies ?? cfg.gateway?.trustedProxies,
    allowRealIpFallback: opts.allowRealIpFallback ?? cfg.gateway?.allowRealIpFallback,
    rateLimiter: opts.rateLimiter,
  });
  if (!authResult.ok) {
    sendGatewayAuthFailure(res, authResult);
    return true;
  }

  const bodyUnknown = await readJsonBodyOrError(req, res, opts.maxBodyBytes ?? DEFAULT_BODY_BYTES);
  if (bodyUnknown === undefined) {
    return true;
  }
  const body = (bodyUnknown ?? {}) as ToolsCallBody;
  const name = str(body.name);
  if (!name) {
    sendInvalidRequest(res, "tools.call requires body.name");
    return true;
  }
  const args = asObj(body.args);

  try {
    const content = await dispatch(name, args);
    sendJson(res, 200, { content });
  } catch (err) {
    if (err instanceof ToolError) {
      sendJson(res, err.status, { error: err.message });
      return true;
    }
    logWarn(`bots-call: tool execution failed (${name}): ${String(err)}`);
    sendJson(res, 500, { error: "tool execution failed" });
  }
  return true;
}
