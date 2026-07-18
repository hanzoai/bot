import { execFile, spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * coding-task.ts — the native coding-task runner: clone a native /v1/git repo,
 * run the coding agent (`dev exec --sandbox workspace-write --json`), commit on a
 * new branch, and push it back with the agent credential.
 *
 * It is transport- AND sandbox-agnostic: every command runs through an injected
 * {@link ExecFn} and the agent through an injected {@link AgentRunner}. In
 * PRODUCTION the run executes inside a per-task docker container (createDockerRuntime,
 * fail-closed) so the model-driven `dev` process CANNOT see the pod env, the pod
 * service-account token, or another tenant's clone. A unit test supplies a host
 * ExecFn + a stub agent against a local bare repo — so the clone→edit→commit→push
 * wrapper AND the env isolation are provable without docker or the real `dev`.
 *
 * ISOLATION INVARIANTS (defense in depth; the container is the primary boundary):
 *   - The coding agent NEVER receives the pod process.env. It gets a MINIMAL
 *     allowlisted env (PATH/HOME/locale + an operator-named model-cred allowlist).
 *     BOT_GATEWAY_TOKEN, KMS/cloud creds, and every pod secret are excluded.
 *   - The git credential rides env `http.extraHeader` ONLY for clone/push (never
 *     argv, never the agent's env), pinned with `http.followRedirects=false`.
 *   - Never `--force`, never a delete refspec; the branch is fresh.
 */

export type ExecResult = { stdout: string; stderr: string; code: number };

/** Runs one argv (no shell — command-injection safe) in cwd; never throws. */
export type ExecFn = (
  argv: string[],
  opts: { cwd: string; env?: NodeJS.ProcessEnv; timeoutMs?: number },
) => Promise<ExecResult>;

export type Credential = { username: string; token: string };

export type CodingEvent = {
  type: "step" | "log" | "result" | "error";
  step?: string;
  message?: string;
  status?: string;
  branch?: string;
  commitSha?: string;
  diffstat?: string;
  changed?: boolean;
  ok?: boolean;
  logTail?: string;
};

export type CodingTaskParams = {
  cloneUrl: string;
  baseBranch: string;
  branch: string;
  prompt: string;
  credential: Credential;
  workdir: string;
  runTimeoutSeconds: number;
};

/** Runs the coding agent in cwd against prompt, streaming log lines via emit. */
export type AgentRunner = (
  args: { cwd: string; prompt: string; timeoutMs: number },
  emit: (e: CodingEvent) => void,
) => Promise<{ ok: boolean; logTail: string }>;

export type CodingDeps = { exec: ExecFn; runAgent: AgentRunner };

/** A runtime = an isolated working dir + the command/agent execers + a disposer. */
export type CodingRuntime = {
  workdir: string;
  deps: CodingDeps;
  cleanup: () => Promise<void>;
};

const LOG_TAIL_CAP = 4096;

// The ONLY env names the coding agent (and git) may inherit from the pod. Anything
// not on this list — BOT_GATEWAY_TOKEN, KMS/cloud creds, k8s vars — is invisible to
// the run. Operators add exactly the model-cred names `dev` needs (nothing secret
// by default) via HANZO_CODING_AGENT_ENV_ALLOW.
const ENV_ALLOW_BASE = [
  "PATH",
  "HOME",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "TERM",
  "TMPDIR",
  "SSL_CERT_FILE",
  "SSL_CERT_DIR",
];

function envAllowNames(): string[] {
  const extra = (process.env.HANZO_CODING_AGENT_ENV_ALLOW ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return [...ENV_ALLOW_BASE, ...extra];
}

function pickEnv(names: string[]): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {};
  for (const n of names) {
    const v = process.env[n];
    if (v !== undefined) {
      out[n] = v;
    }
  }
  return out;
}

/** buildAgentEnv is the MINIMAL, secret-free env the coding agent runs under. */
export function buildAgentEnv(): NodeJS.ProcessEnv {
  return {
    ...pickEnv(envAllowNames()),
    HOME: process.env.HOME ?? "/tmp",
    GIT_TERMINAL_PROMPT: "0",
  };
}

/**
 * gitCredentialEnv injects the agent credential as an HTTP basic-auth header via
 * git's env-based config (GIT_CONFIG_* — NOT argv), so the token never appears in a
 * process listing or a log. It is host-agnostic here; the caller pins the git host
 * (allowlist) and disables redirects so the header cannot travel to another host.
 */
function gitCredentialEnv(cred: Credential): NodeJS.ProcessEnv {
  const basic = Buffer.from(`${cred.username}:${cred.token}`).toString("base64");
  return {
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "http.extraHeader",
    GIT_CONFIG_VALUE_0: `Authorization: Basic ${basic}`,
  };
}

/** buildGitEnv is the minimal git env; with cred it also carries the auth header. */
function buildGitEnv(cred?: Credential): NodeJS.ProcessEnv {
  const base: NodeJS.ProcessEnv = {
    ...pickEnv(["PATH", "HOME", "LANG", "LC_ALL", "TERM", "SSL_CERT_FILE", "SSL_CERT_DIR"]),
    GIT_TERMINAL_PROMPT: "0",
    GIT_CONFIG_NOSYSTEM: "1",
  };
  return cred ? { ...base, ...gitCredentialEnv(cred) } : base;
}

// `-c http.followRedirects=false` on every network git op stops a redirect from
// carrying the auth header to an attacker host (same class the mirror path fixed).
const GIT_NET_HARDENING = ["-c", "http.followRedirects=false"];

function fail(emit: (e: CodingEvent) => void, message: string, logTail = ""): CodingEvent {
  const ev: CodingEvent = { type: "error", ok: false, message, logTail };
  emit(ev);
  return ev;
}

/**
 * runCodingTask executes one coding job and returns the terminal event. The git
 * credential env is applied ONLY to the two network commands (clone, push); the
 * agent and local git run under a minimal, credential-free env.
 */
export async function runCodingTask(
  params: CodingTaskParams,
  deps: CodingDeps,
  emit: (e: CodingEvent) => void,
): Promise<CodingEvent> {
  const { exec, runAgent } = deps;
  const repoDir = join(params.workdir, "repo");
  const netEnv = buildGitEnv(params.credential);
  const localEnv = buildGitEnv();
  const timeoutMs = Math.max(60, params.runTimeoutSeconds) * 1000;

  // 1. shallow clone (secret via env http.extraHeader; redirects disabled).
  emit({ type: "step", step: "clone", status: "start" });
  const cloneArgs = ["git", ...GIT_NET_HARDENING, "clone", "--depth", "1", "--single-branch"];
  if (params.baseBranch) {
    cloneArgs.push("--branch", params.baseBranch);
  }
  cloneArgs.push(params.cloneUrl, repoDir);
  const clone = await exec(cloneArgs, { cwd: params.workdir, env: netEnv, timeoutMs });
  if (clone.code !== 0) {
    return fail(emit, "clone failed", tail(clone.stderr));
  }
  emit({ type: "step", step: "clone", status: "ok" });

  // 2. fresh working branch (never reuses/forces an existing ref).
  const co = await exec(["git", "checkout", "-b", params.branch], { cwd: repoDir, env: localEnv });
  if (co.code !== 0) {
    return fail(emit, "could not create branch", tail(co.stderr));
  }

  // 3. the coding agent edits the tree (workspace-write) under a minimal env.
  emit({ type: "step", step: "code", status: "start" });
  const agent = await runAgent({ cwd: repoDir, prompt: params.prompt, timeoutMs }, emit);
  emit({ type: "step", step: "code", status: agent.ok ? "ok" : "error" });
  if (!agent.ok) {
    return fail(emit, "coding step failed", agent.logTail);
  }

  // 4. stage + detect changes. No changes is a clean, non-error outcome.
  await exec(["git", "add", "-A"], { cwd: repoDir, env: localEnv });
  const status = await exec(["git", "status", "--porcelain"], { cwd: repoDir, env: localEnv });
  if (status.stdout.trim() === "") {
    const ev: CodingEvent = {
      type: "result",
      ok: true,
      changed: false,
      branch: params.branch,
      logTail: agent.logTail,
    };
    emit(ev);
    return ev;
  }

  // 5. commit (fixed identity; the run's attribution lives in the cloud session).
  const commit = await exec(
    [
      "git",
      "-c",
      "user.name=Hanzo Agent",
      "-c",
      "user.email=agent@hanzo.ai",
      "commit",
      "-m",
      commitMessage(params.prompt),
    ],
    { cwd: repoDir, env: localEnv },
  );
  if (commit.code !== 0) {
    return fail(emit, "commit failed", tail(commit.stderr));
  }
  const sha = (
    await exec(["git", "rev-parse", "HEAD"], { cwd: repoDir, env: localEnv })
  ).stdout.trim();
  const diffstat = (
    await exec(["git", "show", "--stat", "--format=", "HEAD"], { cwd: repoDir, env: localEnv })
  ).stdout.trim();

  // 6. push the new branch (plain, fresh ref; never --force, never a delete).
  emit({ type: "step", step: "push", status: "start" });
  const push = await exec(
    ["git", ...GIT_NET_HARDENING, "push", "origin", `HEAD:refs/heads/${params.branch}`],
    { cwd: repoDir, env: netEnv, timeoutMs },
  );
  if (push.code !== 0) {
    return fail(emit, "push failed", tail(push.stderr));
  }
  emit({ type: "step", step: "push", status: "ok" });

  const ev: CodingEvent = {
    type: "result",
    ok: true,
    changed: true,
    branch: params.branch,
    commitSha: sha,
    diffstat,
    logTail: agent.logTail,
  };
  emit(ev);
  return ev;
}

function commitMessage(prompt: string): string {
  const first = prompt.split("\n", 1)[0].trim();
  const subject = first.length > 72 ? first.slice(0, 69) + "..." : first || "agent changes";
  return `${subject}\n\nOpened by the @hanzo coding agent.`;
}

function tail(s: string): string {
  s = (s ?? "").trim();
  return s.length > LOG_TAIL_CAP ? s.slice(-LOG_TAIL_CAP) : s;
}

// ── streaming spawn shared by the host + docker agent runners ─────────────────

function spawnStreaming(
  cmd: string,
  argv: string[],
  env: NodeJS.ProcessEnv,
  cwd: string,
  timeoutMs: number,
  emit: (e: CodingEvent) => void,
): Promise<{ ok: boolean; logTail: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, argv, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    const onData = (b: Buffer) => {
      out += b.toString();
      for (const line of b.toString().split("\n")) {
        const t = line.trim();
        if (t) {
          emit({ type: "log", message: t.slice(0, 500) });
        }
      }
      if (out.length > 1 << 20) {
        out = out.slice(-(1 << 20));
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", (b: Buffer) => {
      out += b.toString();
    });
    child.on("error", () => {
      clearTimeout(timer);
      resolve({ ok: false, logTail: tail(out) });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, logTail: tail(out) });
    });
  });
}

// ── host runtime pieces (TEST/dev seam — NOT the production default) ──────────

/** hostExecFn runs commands on the host via execFile (argv only, no shell). */
export function hostExecFn(): ExecFn {
  return (argv, opts) =>
    new Promise<ExecResult>((resolve) => {
      const [cmd, ...args] = argv;
      execFile(
        cmd,
        args,
        { cwd: opts.cwd, env: opts.env, timeout: opts.timeoutMs, maxBuffer: 64 * 1024 * 1024 },
        (err, stdout, stderr) => {
          const code =
            err && typeof (err as { code?: unknown }).code === "number"
              ? (err as { code: number }).code
              : err
                ? 1
                : 0;
          resolve({ stdout: stdout?.toString() ?? "", stderr: stderr?.toString() ?? "", code });
        },
      );
    });
}

/**
 * devAgentRunner runs `dev exec --sandbox workspace-write --json <prompt>` in cwd
 * under a MINIMAL, secret-free env (buildAgentEnv). command defaults to "dev".
 */
export function devAgentRunner(command = "dev"): AgentRunner {
  return ({ cwd, prompt, timeoutMs }, emit) =>
    spawnStreaming(
      command,
      ["exec", "--sandbox", "workspace-write", "--json", "--skip-git-repo-check", prompt],
      buildAgentEnv(),
      cwd,
      timeoutMs,
      emit,
    );
}

/** makeHostWorkdir creates a fresh unique temp dir + a recursive disposer. */
export async function makeHostWorkdir(): Promise<{ dir: string; cleanup: () => Promise<void> }> {
  const dir = await mkdtemp(join(tmpdir(), "hanzo-coding-"));
  return { dir, cleanup: async () => rm(dir, { recursive: true, force: true }).catch(() => {}) };
}

// ── docker runtime (PRODUCTION default — fail-closed isolation) ───────────────

async function docker(args: string[], timeoutMs = 30_000): Promise<ExecResult> {
  return hostExecFn()(["docker", ...args], { cwd: process.cwd(), timeoutMs });
}

/**
 * createDockerRuntime boots a per-task container that is the real isolation
 * boundary: the model-driven `dev` process cannot see the pod env, the pod
 * service-account token (never mounted), or another tenant's clone.
 *
 *   - MINIMAL env: only the allowlisted names cross into the container (`-e`);
 *     BOT_GATEWAY_TOKEN and every pod secret stay on the host.
 *   - PRIVATE fs: /work and /tmp are per-container tmpfs (nosuid), so a clone is
 *     never visible to another task and vanishes on teardown.
 *   - NO service-account token: a fresh `docker run` does not mount the pod's
 *     /var/run/secrets, so the SA token is unreachable.
 *   - EGRESS: pinned to HANZO_CODING_SANDBOX_NETWORK when set (a git-only network).
 *
 * FAIL CLOSED: an unavailable docker daemon OR an unset sandbox image throws — the
 * handler refuses the run rather than falling back to the shared host.
 */
export async function createDockerRuntime(timeoutSec: number): Promise<CodingRuntime> {
  const image = (process.env.HANZO_CODING_SANDBOX_IMAGE ?? "").trim();
  if (!image) {
    throw new Error("coding sandbox image is not configured (HANZO_CODING_SANDBOX_IMAGE)");
  }
  const ver = await docker(["version", "--format", "{{.Server.Version}}"], 10_000);
  if (ver.code !== 0) {
    throw new Error("container runtime unavailable");
  }

  const runArgs = [
    "run",
    "-d",
    "--rm",
    "--workdir",
    "/work",
    "--tmpfs",
    "/work:rw,nosuid,size=2g",
    "--tmpfs",
    "/tmp:rw,nosuid,noexec,size=512m",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges",
    "-e",
    "HOME=/work",
  ];
  const net = (process.env.HANZO_CODING_SANDBOX_NETWORK ?? "").trim();
  if (net) {
    runArgs.push("--network", net);
  }
  for (const [k, v] of Object.entries(buildAgentEnv())) {
    if (k === "HOME") {
      continue;
    } // container HOME is /work
    if (v !== undefined) {
      runArgs.push("-e", `${k}=${v}`);
    }
  }
  runArgs.push(image, "sleep", String(Math.max(120, timeoutSec + 120)));

  const created = await docker(runArgs, 60_000);
  if (created.code !== 0) {
    throw new Error("could not start coding sandbox");
  }
  const id = created.stdout.trim();

  const exec: ExecFn = async (argv, opts) => {
    // The command's env crosses into the container as `-e` (drop PATH/HOME so the
    // container's own defaults apply); the credential/git-config vars ride through
    // this way. The pod's process.env never crosses.
    const eflags: string[] = [];
    for (const [k, v] of Object.entries(opts.env ?? {})) {
      if (k === "PATH" || k === "HOME") {
        continue;
      }
      if (v !== undefined) {
        eflags.push("-e", `${k}=${v}`);
      }
    }
    return docker(["exec", "-w", opts.cwd, ...eflags, id, ...argv], opts.timeoutMs ?? 60_000);
  };
  const runAgent: AgentRunner = ({ cwd, prompt, timeoutMs }, emit) =>
    spawnStreaming(
      "docker",
      [
        "exec",
        "-w",
        cwd,
        id,
        "dev",
        "exec",
        "--sandbox",
        "workspace-write",
        "--json",
        "--skip-git-repo-check",
        prompt,
      ],
      { ...process.env }, // env of the `docker` CLI on the host — NOT the in-container agent env
      process.cwd(),
      timeoutMs,
      emit,
    );

  return {
    workdir: "/work",
    deps: { exec, runAgent },
    cleanup: async () => {
      await docker(["rm", "-f", id], 30_000).catch(() => {});
    },
  };
}
