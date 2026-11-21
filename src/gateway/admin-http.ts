/**
 * Admin HTTP API for managing hub-provisioned agents.
 *
 * Endpoints:
 *   POST   /v1/admin/agents          — Create or update an agent in bot.json
 *   GET    /v1/admin/agents          — List active agents
 *   GET    /v1/admin/agents/:agentId — Get agent details
 *   DELETE /v1/admin/agents/:agentId — Remove agent from bot.json
 *
 * Auth: BOT_GATEWAY_TOKEN (same as gateway auth).
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";
import type { AgentConfig } from "../config/types.agents.js";
import type { BotConfig } from "../config/types.js";
import { loadConfig, writeConfigFile } from "../config/config.js";
import { getBearerToken } from "./http-utils.js";

const ADMIN_PATH_PREFIX = "/v1/admin";

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function sendText(res: ServerResponse, status: number, text: string) {
  res.statusCode = status;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.end(text);
}

function readBody(req: IncomingMessage, maxBytes = 1024 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error("Body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function authorizeAdmin(req: IncomingMessage, adminToken: string): boolean {
  if (!adminToken) {
    return false;
  }
  const bearer = getBearerToken(req);
  if (!bearer) {
    return false;
  }
  return safeEqual(bearer, adminToken);
}

function parseAgentIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/v1\/admin\/agents\/([^/]+)$/);
  return match?.[1] ?? null;
}

/**
 * Handle admin API requests.
 * Returns true if the request was handled, false if not an admin path.
 */
export async function handleAdminHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  opts: { adminToken: string },
): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const pathname = url.pathname;

  if (!pathname.startsWith(ADMIN_PATH_PREFIX)) {
    return false;
  }

  // Auth check
  if (!authorizeAdmin(req, opts.adminToken)) {
    sendText(res, 401, "Unauthorized");
    return true;
  }

  const method = (req.method ?? "GET").toUpperCase();

  // GET /v1/admin/agents — list agents
  if (pathname === "/v1/admin/agents" && method === "GET") {
    const config = loadConfig();
    const agents = config.agents?.list ?? [];
    sendJson(res, 200, {
      agents: agents.map((a) => ({
        id: a.id,
        name: a.name,
        model: a.model,
        workspace: a.workspace,
        skills: a.skills,
        hasAuth: Boolean(a.auth?.token),
      })),
    });
    return true;
  }

  // POST /v1/admin/agents — create/update agent
  if (pathname === "/v1/admin/agents" && method === "POST") {
    try {
      const body = JSON.parse(await readBody(req)) as Record<string, unknown>;
      const agentId = String((body.id as string) ?? "");
      if (!agentId) {
        sendJson(res, 400, { error: "Missing agent id" });
        return true;
      }

      const newAgent: AgentConfig = {
        id: agentId,
        name: body.name ? String(body.name as string) : undefined,
        model: body.model ? String(body.model as string) : undefined,
        workspace: body.workspace ? String(body.workspace as string) : undefined,
        skills: Array.isArray(body.skills) ? body.skills.map(String) : undefined,
        auth:
          body.auth && typeof body.auth === "object"
            ? {
                token: (body.auth as Record<string, unknown>).token
                  ? String((body.auth as Record<string, unknown>).token as string)
                  : undefined,
              }
            : undefined,
      };

      if (body.identity && typeof body.identity === "object") {
        const ident = body.identity as Record<string, unknown>;
        newAgent.identity = {
          name: ident.name ? String(ident.name as string) : undefined,
        };
      }

      const config = loadConfig();
      const agents = config.agents?.list ? [...config.agents.list] : [];
      const existingIndex = agents.findIndex((a) => a.id === agentId);
      if (existingIndex >= 0) {
        agents[existingIndex] = { ...agents[existingIndex], ...newAgent };
      } else {
        agents.push(newAgent);
      }

      const updatedConfig: BotConfig = {
        ...config,
        agents: {
          ...config.agents,
          list: agents,
        },
      };

      await writeConfigFile(updatedConfig);
      sendJson(res, existingIndex >= 0 ? 200 : 201, { ok: true, agentId });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Invalid request";
      sendJson(res, 400, { error: message });
      return true;
    }
  }

  // GET /v1/admin/agents/:agentId — get agent details
  const getAgentId = parseAgentIdFromPath(pathname);
  if (getAgentId && method === "GET") {
    const config = loadConfig();
    const agent = config.agents?.list?.find((a) => a.id === getAgentId);
    if (!agent) {
      sendJson(res, 404, { error: "Agent not found" });
      return true;
    }
    sendJson(res, 200, {
      id: agent.id,
      name: agent.name,
      model: agent.model,
      workspace: agent.workspace,
      skills: agent.skills,
      hasAuth: Boolean(agent.auth?.token),
    });
    return true;
  }

  // DELETE /v1/admin/agents/:agentId — remove agent
  const deleteAgentId = parseAgentIdFromPath(pathname);
  if (deleteAgentId && method === "DELETE") {
    const config = loadConfig();
    const agents = config.agents?.list ?? [];
    const filtered = agents.filter((a) => a.id !== deleteAgentId);
    if (filtered.length === agents.length) {
      sendJson(res, 404, { error: "Agent not found" });
      return true;
    }

    const updatedConfig: BotConfig = {
      ...config,
      agents: {
        ...config.agents,
        list: filtered,
      },
    };

    await writeConfigFile(updatedConfig);
    sendJson(res, 200, { ok: true, agentId: deleteAgentId });
    return true;
  }

  sendText(res, 404, "Not Found");
  return true;
}
