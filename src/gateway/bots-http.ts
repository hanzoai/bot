/**
 * Bots HTTP API — the org-scoped list + stop surface Hanzo Cloud proxies for
 * the hanzo.bot console (GET /v1/bots, POST /v1/bots/:runId/stop).
 *
 * Endpoints:
 *   GET  /v1/bots               — list the caller org's bot runs
 *   POST /v1/bots/:runId/stop   — stop one of the caller org's runs
 *
 * Auth: pure-trust identity headers (getIamIdentity) — the same contract every
 * gateway handler uses. hanzoai/gateway validates the IAM JWT upstream and mints
 * X-Org-Id; the cloud control plane forwards it server-side. Isolation is the
 * tenant path: a run lives in that org's session store under
 * ~/.bot/tenants/{orgId}/agents/{agentId}/sessions/, so one org can never see or
 * stop another's runs. No org header (self-hosted / no gateway) => empty list,
 * 404 stop.
 *
 * A "run" is a persisted session entry; sessionUrl is NOT emitted here — the
 * control plane derives it from runId (the one place a session URL is built).
 */

import fs from "node:fs";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { sendJson } from "./http-common.js";
import { getIamIdentity } from "./iam-identity.js";
import { loadSessionStore, updateSessionStore } from "../config/sessions.js";
import type { SessionEntry } from "../config/sessions/types.js";
import { resolveTenantStateDir } from "../config/tenant-paths.js";
import { isCronRunSessionKey } from "../sessions/session-key-utils.js";

const BOTS_PATH = "/v1/bots";
const STOP_RE = /^\/v1\/bots\/([^/]+)\/stop$/;

// Reserved session keys that are never bot runs.
const RESERVED_KEYS = new Set(["global", "unknown"]);

type BotView = {
  runId: string;
  task: string;
  surface: string;
  status: string;
  startedAt: string;
};

/**
 * Resolve every existing sessions.json under the caller org's tenant tree
 * (one per agent). Missing tree => []. This is the org boundary: the path is
 * derived from orgId, so the scan can only ever reach this org's runs.
 */
function tenantStorePaths(orgId: string, userId: string): string[] {
  const stateDir = resolveTenantStateDir({ orgId, userId });
  const agentsDir = path.join(stateDir, "agents");
  let agentIds: string[];
  try {
    agentIds = fs.readdirSync(agentsDir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? [e.name] : [],
    );
  } catch {
    return [];
  }
  const paths: string[] = [];
  for (const agentId of agentIds) {
    const storePath = path.join(agentsDir, agentId, "sessions", "sessions.json");
    if (fs.existsSync(storePath)) {
      paths.push(storePath);
    }
  }
  return paths;
}

function isRunKey(key: string): boolean {
  return !RESERVED_KEYS.has(key) && !isCronRunSessionKey(key);
}

function toBotView(key: string, entry: SessionEntry): BotView {
  const task = entry.label ?? entry.displayName ?? entry.subject ?? "";
  const surface = entry.origin?.surface ?? "desktop";
  const startedAtMs =
    typeof entry.updatedAt === "number" && Number.isFinite(entry.updatedAt) && entry.updatedAt > 0
      ? entry.updatedAt
      : Date.now();
  return {
    runId: key,
    task,
    surface,
    status: "running",
    startedAt: new Date(startedAtMs).toISOString(),
  };
}

function listOrgBots(orgId: string, userId: string): BotView[] {
  const bots: BotView[] = [];
  for (const storePath of tenantStorePaths(orgId, userId)) {
    const store = loadSessionStore(storePath);
    for (const [key, entry] of Object.entries(store)) {
      if (isRunKey(key) && entry) {
        bots.push(toBotView(key, entry));
      }
    }
  }
  return bots;
}

/**
 * Stop a run by removing its entry from whichever of the org's stores holds it.
 * Returns true if a run was found and stopped, false if the org owns no such run.
 */
async function stopOrgBot(orgId: string, userId: string, runId: string): Promise<boolean> {
  if (!isRunKey(runId)) {
    return false;
  }
  for (const storePath of tenantStorePaths(orgId, userId)) {
    const removed = await updateSessionStore(storePath, (store) => {
      if (!store[runId]) {
        return false;
      }
      delete store[runId];
      return true;
    });
    if (removed) {
      return true;
    }
  }
  return false;
}

/**
 * Handle a bots API request. Returns true if handled (even on error), false if
 * the path is not a bots route so the request falls through to the next stage.
 */
export async function handleBotsHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const pathname = url.pathname;
  const stopMatch = pathname.match(STOP_RE);
  if (pathname !== BOTS_PATH && !stopMatch) {
    return false;
  }

  const method = (req.method ?? "GET").toUpperCase();
  const { orgId, userId } = getIamIdentity(req);

  // GET /v1/bots — list.
  if (pathname === BOTS_PATH) {
    if (method !== "GET") {
      res.statusCode = 405;
      res.setHeader("Allow", "GET");
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("Method Not Allowed");
      return true;
    }
    const bots = orgId ? listOrgBots(orgId, userId ?? "unknown") : [];
    sendJson(res, 200, { bots });
    return true;
  }

  // POST /v1/bots/:runId/stop — stop.
  const runId = decodeURIComponent(stopMatch![1]);
  if (method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Allow", "POST");
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Method Not Allowed");
    return true;
  }
  const stopped = orgId ? await stopOrgBot(orgId, userId ?? "unknown", runId) : false;
  if (!stopped) {
    sendJson(res, 404, { error: "no such bot for this org" });
    return true;
  }
  sendJson(res, 200, { runId, status: "stopped" });
  return true;
}
