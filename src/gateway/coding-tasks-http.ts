import type { IncomingMessage, ServerResponse } from "node:http";
import {
  readJsonBodyOrError,
  sendGatewayAuthFailure,
  sendInvalidRequest,
  sendMethodNotAllowed,
} from "./http-common.js";
import { getIamIdentity } from "./iam-identity.js";
import { authorizeHttpGatewayConnect, type ResolvedGatewayAuth } from "./auth.js";
import type { AuthRateLimiter } from "./auth-rate-limit.js";
import { getBearerToken } from "./http-utils.js";
import { loadConfig } from "../config/config.js";
import { logWarn } from "../logger.js";
import {
  type CodingDeps,
  type CodingEvent,
  devAgentRunner,
  hostExecFn,
  makeHostWorkdir,
  runCodingTask,
} from "./coding-task.js";

/**
 * coding-tasks-http.ts — POST /v1/coding-tasks: the native coding-task runner the
 * cloud control plane drives to turn @hanzo into an engineer. Cloud clones a
 * native /v1/git repo, runs the agent, commits, pushes a branch, and streams
 * NDJSON progress + a terminal result back so cloud mirrors it into the agent
 * session and reports to Slack.
 *
 * AUTH: the pod-boundary gate (authorizeHttpGatewayConnect) runs FIRST — this
 * server is reachable off-gateway (in-cluster / SSRF), so the forwarded X-Org-Id
 * is trusted ONLY after the caller is proven authorized (parity with bots /
 * tools-invoke). The org boundary then comes from the minted X-Org-Id, and the
 * body's clone URL org segment must match it — a forged body cannot point the
 * sandbox at another org's repo.
 *
 * ISOLATION NOTE: the run currently executes in a per-request temp workdir on the
 * pod (hostRuntime), confined + cleaned up. Per-task container isolation (a
 * workspace-write docker sandbox) is a swap of the injected {@link CodingDeps}
 * ExecFn to a `docker exec` runner — the runner (coding-task.ts) is already
 * sandbox-agnostic — and is the multi-tenant hardening follow-on.
 */

const CODING_PATH = "/v1/coding-tasks";
const MAX_BODY_BYTES = 256 * 1024;
const DEFAULT_TIMEOUT_SECONDS = 1200;
const MAX_TIMEOUT_SECONDS = 3600;

// A safe, agent-owned branch: never a delete/refspec, never HEAD, never a path
// escape. Cloud always names it agent/<id>.
const BRANCH_RE = /^[A-Za-z][A-Za-z0-9._/-]{0,100}$/;

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
 * A runtime provides a working dir, the command ExecFn, the agent runner, and a
 * disposer. Injectable so a test drives the full handler (auth + parse + stream)
 * with a host runtime + stub agent, no docker.
 */
export type CodingRuntime = {
  workdir: string;
  deps: CodingDeps;
  cleanup: () => Promise<void>;
};

/** hostRuntime confines a run to a fresh temp dir and runs the real `dev` agent. */
async function hostRuntime(): Promise<CodingRuntime> {
  const { dir, cleanup } = await makeHostWorkdir();
  return { workdir: dir, deps: { exec: hostExecFn(), runAgent: devAgentRunner() }, cleanup };
}

/**
 * handleCodingTasksHttpRequest is the gateway stage for POST /v1/coding-tasks.
 * makeRuntime is injectable for tests (default = hostRuntime).
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
  makeRuntime: () => Promise<CodingRuntime> = hostRuntime,
): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname !== CODING_PATH) return false;

  // Pod-boundary auth FIRST — X-Org-Id is untrusted until the caller is authorized.
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
  if ((req.method ?? "GET").toUpperCase() !== "POST") {
    sendMethodNotAllowed(res, "POST");
    return true;
  }

  const raw = await readJsonBodyOrError(req, res, MAX_BODY_BYTES);
  if (raw === undefined) return true;

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

  // Stream NDJSON: one JSON object per line, terminal line is result|error.
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/x-ndjson");
  res.setHeader("Cache-Control", "no-cache");
  const emit = (e: CodingEvent) => {
    if (!res.writableEnded) res.write(JSON.stringify(e) + "\n");
  };

  let runtime: CodingRuntime | undefined;
  try {
    runtime = await makeRuntime();
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
    // A credential can never be in an error message (it lives only in git subprocess
    // env), so surfacing the message is safe; still, keep it terse.
    logWarn(`coding-task: run error: ${errText(err)}`);
    emit({ type: "error", ok: false, message: "coding task crashed" });
  } finally {
    await runtime?.cleanup().catch(() => {});
    if (!res.writableEnded) res.end();
  }
  return true;
}

type ParseResult =
  | { ok: true; value: CodingTaskBody }
  | { ok: false; error: string };

/**
 * parseBody validates the request and — critically — enforces that the clone URL's
 * org segment matches the authenticated org (orgId). A forged body pointing at
 * another org's repo is refused here (defense in depth; the org-scoped credential
 * would also fail at the git edge).
 */
function parseBody(raw: unknown, orgId: string): ParseResult {
  if (typeof raw !== "object" || raw === null) return { ok: false, error: "body must be an object" };
  const b = raw as Record<string, unknown>;
  const cloneUrl = str(b.cloneUrl);
  const branch = str(b.branch);
  const prompt = str(b.prompt);
  const cred = b.credential as Record<string, unknown> | undefined;
  const token = str(cred?.token);

  if (!cloneUrl || !/^https:\/\//.test(cloneUrl)) return { ok: false, error: "cloneUrl must be https" };
  const orgInUrl = cloneOrg(cloneUrl);
  if (!orgInUrl) return { ok: false, error: "cloneUrl is not a /v1/git URL" };
  if (orgInUrl !== orgId) return { ok: false, error: "cloneUrl org does not match authenticated org" };
  if (!branch || !BRANCH_RE.test(branch)) return { ok: false, error: "invalid branch" };
  if (!prompt.trim()) return { ok: false, error: "empty prompt" };
  if (!token) return { ok: false, error: "missing credential" };

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
function cloneOrg(cloneUrl: string): string | null {
  try {
    const m = new URL(cloneUrl).pathname.match(/^\/v1\/git\/([^/]+)\//);
    return m ? decodeURIComponent(m[1]!) : null;
  } catch {
    return null;
  }
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function num(v: unknown, dflt: number): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.floor(v) : dflt;
}
function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
