import type { IncomingMessage, ServerResponse } from "node:http";
import { loadConfig } from "../config/config.js";
import { logWarn } from "../logger.js";
import type { AuthRateLimiter } from "./auth-rate-limit.js";
import { authorizeHttpGatewayConnect, type ResolvedGatewayAuth } from "./auth.js";
import {
  type CodingEvent,
  type CodingRuntime,
  createDockerRuntime,
  runCodingTask,
} from "./coding-task.js";
import {
  readJsonBodyOrError,
  sendGatewayAuthFailure,
  sendInvalidRequest,
  sendJson,
  sendMethodNotAllowed,
} from "./http-common.js";
import { getBearerToken } from "./http-utils.js";
import { getIamIdentity } from "./iam-identity.js";

/**
 * coding-tasks-http.ts — POST /v1/coding-tasks: the native coding-task runner the
 * cloud control plane drives to turn @hanzo into an engineer. Cloud clones a
 * native /v1/git repo, runs the agent, commits, pushes a branch, and streams
 * NDJSON progress + a terminal result back so cloud mirrors it into the agent
 * session and reports to Slack.
 *
 * AUTH (fail-closed): the gateway service auth mode must be token|iam — a "none"
 * mode would make the pod-boundary gate a no-op and let any in-cluster caller / SSRF
 * forge X-Org-Id, so this handler refuses to serve under it. Then the gate
 * (authorizeHttpGatewayConnect) runs; X-Org-Id is trusted ONLY after it passes.
 *
 * ISOLATION (fail-closed): the run executes inside a PER-TASK docker container
 * (createDockerRuntime) — the real boundary against the crown-jewel exfil, since a
 * model-driven `dev` run can otherwise read the pod env (BOT_GATEWAY_TOKEN) and the
 * pod service-account token and commit them out via the push. If the container
 * runtime is unavailable the handler REFUSES (503) — it never falls back to the
 * shared pod host. The clone URL is host-pinned to the git edge and its org segment
 * must equal the authenticated org.
 */

const CODING_PATH = "/v1/coding-tasks";
const MAX_BODY_BYTES = 256 * 1024;
const DEFAULT_TIMEOUT_SECONDS = 1200;
const MAX_TIMEOUT_SECONDS = 3600;

// The branch is minted by cloud as agent/<hex session suffix>; constrain to exactly
// that shape so no delete refspec, HEAD, or path escape can slip through.
const BRANCH_RE = /^agent\/[a-f0-9]{6,64}$/;

// The git hosts a clone URL may target — pinned to cloud's git edge so the
// credential can never be aimed at an attacker host. Override via HANZO_CODING_GIT_HOSTS.
function gitHostAllow(): string[] {
  const raw = (process.env.HANZO_CODING_GIT_HOSTS ?? "git.hanzo.ai,api.hanzo.ai")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return raw;
}

// Bot-side concurrency caps (mirror cloud's 8-global / 2-org) so one tenant can't
// exhaust the sandbox pool. Read at call time for testability.
function globalCap(): number {
  return envInt("HANZO_CODING_CONCURRENCY", 8);
}
function orgCap(): number {
  return envInt("HANZO_CODING_ORG_CONCURRENCY", 2);
}
let inflightGlobal = 0;
const inflightByOrg = new Map<string, number>();
function acquire(org: string): boolean {
  if (inflightGlobal >= globalCap()) {
    return false;
  }
  const o = inflightByOrg.get(org) ?? 0;
  if (o >= orgCap()) {
    return false;
  }
  inflightGlobal++;
  inflightByOrg.set(org, o + 1);
  return true;
}
function release(org: string): void {
  inflightGlobal = Math.max(0, inflightGlobal - 1);
  const o = (inflightByOrg.get(org) ?? 1) - 1;
  if (o <= 0) {
    inflightByOrg.delete(org);
  } else {
    inflightByOrg.set(org, o);
  }
}

type CodingTaskBody = {
  cloneUrl: string;
  baseBranch: string;
  branch: string;
  prompt: string;
  sessionId: string;
  runTimeoutSeconds: number;
  credential: { username: string; token: string };
};

/**
 * authModeAllowed asserts the gateway service auth is actually enforcing — mode
 * iam, or mode token WITH a token set. A "none"/tokenless mode is fail-closed here.
 */
function authModeAllowed(auth: ResolvedGatewayAuth): boolean {
  const a = auth as { mode?: string; token?: string };
  if (a.mode === "iam") {
    return true;
  }
  if (a.mode === "token" && typeof a.token === "string" && a.token.length > 0) {
    return true;
  }
  return false;
}

/**
 * handleCodingTasksHttpRequest is the gateway stage for POST /v1/coding-tasks.
 * makeRuntime is injectable for tests (default = a fail-closed docker container).
 */
export async function handleCodingTasksHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  opts: {
    auth: ResolvedGatewayAuth;
    trustedProxies?: string[];
    allowRealIpFallback?: boolean;
    rateLimiter?: AuthRateLimiter;
  },
  makeRuntime: (timeoutSec: number) => Promise<CodingRuntime> = createDockerRuntime,
): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname !== CODING_PATH) {
    return false;
  }

  // HIGH-2: refuse to serve if the pod-boundary auth is not actually enforcing.
  if (!authModeAllowed(opts.auth)) {
    sendJson(res, 503, {
      error: {
        message: "coding tasks require an enforcing gateway auth mode",
        type: "server_error",
      },
    });
    return true;
  }

  // Pod-boundary auth — X-Org-Id is untrusted until the caller is authorized.
  const cfg = loadConfig();
  const token = getBearerToken(req);
  const authResult = await authorizeHttpGatewayConnect({
    auth: opts.auth,
    connectAuth: token ? { token } : null,
    req,
    trustedProxies: opts.trustedProxies ?? cfg.gateway?.trustedProxies,
    allowRealIpFallback: opts.allowRealIpFallback ?? cfg.gateway?.allowRealIpFallback,
    rateLimiter: opts.rateLimiter,
  });
  if (!authResult.ok) {
    sendGatewayAuthFailure(res, authResult);
    return true;
  }
  if ((req.method ?? "GET").toUpperCase() !== "POST") {
    sendMethodNotAllowed(res, "POST");
    return true;
  }

  const raw = await readJsonBodyOrError(req, res, MAX_BODY_BYTES);
  if (raw === undefined) {
    return true;
  }

  const { orgId } = getIamIdentity(req);
  if (!orgId) {
    sendInvalidRequest(res, "missing tenant identity");
    return true;
  }
  const parsed = parseBody(raw, orgId);
  if (!parsed.ok) {
    sendInvalidRequest(res, parsed.error);
    return true;
  }
  const body = parsed.value;

  // MEDIUM-5: bound concurrent runs (global + per-org) before doing any work.
  if (!acquire(orgId)) {
    sendJson(res, 429, {
      error: { message: "coding tasks at capacity, retry shortly", type: "rate_limit_error" },
    });
    return true;
  }

  // CRITICAL-1(e): boot the isolated runtime BEFORE streaming; if it can't be
  // created (no container runtime / no image), REFUSE — never run on the host.
  let runtime: CodingRuntime;
  try {
    runtime = await makeRuntime(body.runTimeoutSeconds);
  } catch (err) {
    release(orgId);
    logWarn(`coding-task: runtime unavailable: ${errText(err)}`);
    sendJson(res, 503, { error: { message: "coding sandbox unavailable", type: "server_error" } });
    return true;
  }

  // Stream NDJSON: one JSON object per line, terminal line is result|error.
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/x-ndjson");
  res.setHeader("Cache-Control", "no-cache");
  const emit = (e: CodingEvent) => {
    if (!res.writableEnded) {
      res.write(JSON.stringify(e) + "\n");
    }
  };

  try {
    await runCodingTask(
      {
        cloneUrl: body.cloneUrl,
        baseBranch: body.baseBranch,
        branch: body.branch,
        prompt: body.prompt,
        credential: body.credential,
        workdir: runtime.workdir,
        runTimeoutSeconds: body.runTimeoutSeconds,
      },
      runtime.deps,
      emit,
    );
  } catch (err) {
    logWarn(`coding-task: run error: ${errText(err)}`);
    emit({ type: "error", ok: false, message: "coding task crashed" });
  } finally {
    await runtime.cleanup().catch(() => {});
    release(orgId);
    if (!res.writableEnded) {
      res.end();
    }
  }
  return true;
}

type ParseResult = { ok: true; value: CodingTaskBody } | { ok: false; error: string };

/**
 * parseBody validates the request and — critically — enforces (a) the clone URL is
 * https on an ALLOWLISTED git host, and (b) its org segment matches the
 * authenticated org. A forged body pointing the sandbox at another org's repo or an
 * attacker host is refused here (defense in depth; the org-scoped credential would
 * also fail at the git edge, and followRedirects=false blocks a redirect bounce).
 */
function parseBody(raw: unknown, orgId: string): ParseResult {
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, error: "body must be an object" };
  }
  const b = raw as Record<string, unknown>;
  const cloneUrl = str(b.cloneUrl);
  const branch = str(b.branch);
  const prompt = str(b.prompt);
  const cred = b.credential as Record<string, unknown> | undefined;
  const token = str(cred?.token);

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(cloneUrl);
  } catch {
    return { ok: false, error: "invalid cloneUrl" };
  }
  if (parsedUrl.protocol !== "https:") {
    return { ok: false, error: "cloneUrl must be https" };
  }
  if (!gitHostAllow().includes(parsedUrl.hostname.toLowerCase())) {
    return { ok: false, error: "cloneUrl host is not an allowed git host" };
  }
  const orgInUrl = cloneOrg(parsedUrl);
  if (!orgInUrl) {
    return { ok: false, error: "cloneUrl is not a /v1/git URL" };
  }
  if (orgInUrl !== orgId) {
    return { ok: false, error: "cloneUrl org does not match authenticated org" };
  }
  if (!branch || !BRANCH_RE.test(branch)) {
    return { ok: false, error: "invalid branch" };
  }
  if (!prompt.trim()) {
    return { ok: false, error: "empty prompt" };
  }
  if (!token) {
    return { ok: false, error: "missing credential" };
  }

  const requested = num(b.runTimeoutSeconds, DEFAULT_TIMEOUT_SECONDS);
  return {
    ok: true,
    value: {
      cloneUrl,
      baseBranch: str(b.baseBranch),
      branch,
      prompt,
      sessionId: str(b.sessionId),
      runTimeoutSeconds: Math.min(Math.max(requested, 60), MAX_TIMEOUT_SECONDS),
      credential: { username: str(cred?.username) || "x-access-token", token },
    },
  };
}

/** cloneOrg extracts <org> from https://host/v1/git/<org>/<repo>.git. */
function cloneOrg(u: URL): string | null {
  const m = u.pathname.match(/^\/v1\/git\/([^/]+)\//);
  return m ? decodeURIComponent(m[1]) : null;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function num(v: unknown, dflt: number): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.floor(v) : dflt;
}
function envInt(name: string, dflt: number): number {
  const n = parseInt((process.env[name] ?? "").trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : dflt;
}
function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
