/**
 * Bots HTTP API — the org-scoped run surface Hanzo Cloud calls for the console
 * (cloud apps/bot, /v1/bot/runs). The runs themselves live in bot-runs.ts.
 *
 *   GET  /v1/bots               list the caller org's runs
 *   POST /v1/bots               launch a run of one of the caller org's bots
 *   POST /v1/bots/:runId/stop   stop one of the caller org's runs
 *
 * AUTH: the pod-boundary gate (authorizeHttpGatewayConnect) runs FIRST — this
 * server is reachable off-gateway (in-cluster, SSRF, and gw.hanzo.bot in public),
 * so no header is trusted until the gate has said who is asking.
 *
 * WHICH ORG is decided by WHAT the gate proved (callerOrg), and nothing else:
 *   - an IAM token: the org the token belongs to — its `owner` claim, cloud's own
 *     scoping key. X-Org-Id may repeat it and may not name any other org, so a
 *     signed-in caller cannot reach a stranger's tenant.
 *   - the shared service bearer: only cloud holds it, and cloud mints X-Org-Id
 *     from its own validated principal, so the header is the org.
 *   - anything else: no tenant — an empty list, a 404 stop, a refused launch.
 *
 * A LAUNCH RUNS AS ITS CALLER. The run's sandbox is leased from cloud with the
 * caller's own bearer, so it is billed to and signed in as the caller; a request
 * that did not present one — the service bearer included — cannot launch.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { loadConfig } from "../config/config.js";
import { readJsonBodyWithLimit } from "../infra/http-body.js";
import { DEFAULT_AGENT_ID, isValidAgentId } from "../routing/session-key.js";
import type { AuthRateLimiter } from "./auth-rate-limit.js";
import {
  authorizeHttpGatewayConnect,
  type GatewayAuthResult,
  type ResolvedGatewayAuth,
} from "./auth.js";
import {
  BOT_RUN_SURFACES,
  type BotRuns,
  BotRunsBusy,
  BotRunsUnavailable,
  type BotRunSurface,
  botRuns,
  MAX_RUN_SECONDS,
  MIN_RUN_SECONDS,
} from "./bot-runs.js";
import { sendGatewayAuthFailure, sendJson } from "./http-common.js";
import { getBearerToken } from "./http-utils.js";
import { getIamIdentity } from "./iam-identity.js";

const BOTS_PATH = "/v1/bots";
const STOP_RE = /^\/v1\/bots\/([^/]+)\/stop$/;
const MAX_BODY_BYTES = 64 * 1024;
const MAX_TASK_BYTES = 32 * 1024;

/**
 * callerOrg is the ONE answer to "which tenant is this request". See the file
 * header for the rule; null means no tenant.
 */
export function callerOrg(auth: GatewayAuthResult, header: string | null): string | null {
  if (auth.method === "iam") {
    if (!auth.owner) {
      return null;
    }
    return !header || header === auth.owner ? auth.owner : null;
  }
  if (auth.method === "token") {
    return header;
  }
  return null;
}

type Launch = { bot: string; task: string; surface: BotRunSurface; timeoutSec: number };

/** parseLaunch validates a launch body at the boundary, so the run plane trusts it. */
export function parseLaunch(
  raw: unknown,
): { ok: true; value: Launch } | { ok: false; error: string } {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, error: "body must be an object" };
  }
  const b = raw as Record<string, unknown>;
  const task = typeof b.task === "string" ? b.task.trim() : "";
  if (!task) {
    return { ok: false, error: "task is required" };
  }
  if (Buffer.byteLength(task) > MAX_TASK_BYTES) {
    return { ok: false, error: `task exceeds ${MAX_TASK_BYTES} bytes` };
  }
  const surface = b.surface === undefined || b.surface === "" ? "desktop" : b.surface;
  if (!BOT_RUN_SURFACES.includes(surface as BotRunSurface)) {
    return { ok: false, error: `surface must be one of ${BOT_RUN_SURFACES.join(", ")}` };
  }
  let bot: string = DEFAULT_AGENT_ID;
  if (b.bot !== undefined && b.bot !== "") {
    // The bot names a directory under the org's tenant tree, so it must be a
    // path-safe agent id as written — never silently folded into another one.
    if (typeof b.bot !== "string" || !isValidAgentId(b.bot)) {
      return { ok: false, error: "bot must be an agent id" };
    }
    bot = b.bot.trim().toLowerCase();
  }
  let timeoutSec = MAX_RUN_SECONDS;
  if (b.timeoutSeconds !== undefined) {
    const t = b.timeoutSeconds;
    if (
      typeof t !== "number" ||
      !Number.isInteger(t) ||
      t < MIN_RUN_SECONDS ||
      t > MAX_RUN_SECONDS
    ) {
      return {
        ok: false,
        error: `timeoutSeconds must be an integer from ${MIN_RUN_SECONDS} to ${MAX_RUN_SECONDS}`,
      };
    }
    timeoutSec = t;
  }
  return { ok: true, value: { bot, task, surface: surface as BotRunSurface, timeoutSec } };
}

/**
 * Handle a bots API request. Returns true if handled (even on error), false if
 * the path is not a bots route so the request falls through to the next stage.
 */
export async function handleBotsHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  opts: {
    auth: ResolvedGatewayAuth;
    trustedProxies?: string[];
    allowRealIpFallback?: boolean;
    rateLimiter?: AuthRateLimiter;
    /** The run plane. Defaults to this process's. */
    runs?: BotRuns;
  },
): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const pathname = url.pathname;
  const stopMatch = pathname.match(STOP_RE);
  if (pathname !== BOTS_PATH && !stopMatch) {
    return false;
  }

  const cfg = loadConfig();
  const token = getBearerToken(req);
  const auth = await authorizeHttpGatewayConnect({
    auth: opts.auth,
    connectAuth: token ? { token } : null,
    req,
    trustedProxies: opts.trustedProxies ?? cfg.gateway?.trustedProxies,
    allowRealIpFallback: opts.allowRealIpFallback ?? cfg.gateway?.allowRealIpFallback,
    rateLimiter: opts.rateLimiter,
  });
  if (!auth.ok) {
    sendGatewayAuthFailure(res, auth);
    return true;
  }

  const runs = opts.runs ?? botRuns();
  const method = (req.method ?? "GET").toUpperCase();
  const org = callerOrg(auth, getIamIdentity(req).orgId);

  if (pathname === BOTS_PATH) {
    if (method === "GET") {
      sendJson(res, 200, { bots: org ? runs.list(org) : [] });
      return true;
    }
    if (method === "POST") {
      await launch(req, res, runs, auth, org);
      return true;
    }
    methodNotAllowed(res, "GET, POST");
    return true;
  }

  if (method !== "POST") {
    methodNotAllowed(res, "POST");
    return true;
  }
  let runId: string;
  try {
    runId = decodeURIComponent(stopMatch![1]);
  } catch {
    sendJson(res, 404, { error: "no such bot for this org" });
    return true;
  }
  if (!org || !(await runs.stop(org, runId))) {
    sendJson(res, 404, { error: "no such bot for this org" });
    return true;
  }
  sendJson(res, 200, { runId, status: "stopped" });
  return true;
}

async function launch(
  req: IncomingMessage,
  res: ServerResponse,
  runs: BotRuns,
  auth: GatewayAuthResult,
  org: string | null,
): Promise<void> {
  if (auth.method !== "iam" || !auth.bearer) {
    sendJson(res, 401, {
      error: "a bot run runs as its caller: present the caller's own IAM bearer",
    });
    return;
  }
  if (!org) {
    sendJson(res, 403, { error: "the caller does not act in that org" });
    return;
  }
  const body = await readJsonBodyWithLimit(req, { maxBytes: MAX_BODY_BYTES });
  if (!body.ok) {
    sendJson(res, body.code === "PAYLOAD_TOO_LARGE" ? 413 : 400, { error: body.error });
    return;
  }
  const parsed = parseLaunch(body.value);
  if (!parsed.ok) {
    sendJson(res, 400, { error: parsed.error });
    return;
  }
  try {
    const run = await runs.launch({ caller: { org, bearer: auth.bearer }, ...parsed.value });
    sendJson(res, 201, run);
  } catch (err) {
    if (err instanceof BotRunsBusy) {
      sendJson(res, 429, { error: err.message });
    } else if (err instanceof BotRunsUnavailable) {
      sendJson(res, 503, { error: err.message });
    } else {
      sendJson(res, 500, { error: "the run could not be recorded, so nothing was started" });
    }
  }
}

function methodNotAllowed(res: ServerResponse, allow: string) {
  res.statusCode = 405;
  res.setHeader("Allow", allow);
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.end("Method Not Allowed");
}
