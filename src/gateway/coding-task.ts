import { execFile } from "node:child_process";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * coding-task.ts — the native coding-task runner: clone a native /v1/git repo,
 * run the coding agent (`dev exec --sandbox workspace-write --json`), commit on a
 * new branch, and push it back with the agent credential.
 *
 * It is transport- AND sandbox-agnostic: every command runs through an injected
 * {@link ExecFn}. In production the handler supplies a runtime whose ExecFn runs
 * inside a workspace-write container; a unit test supplies a host ExecFn against a
 * local bare repo with a stubbed agent step — so the whole clone→edit→commit→push
 * wrapper is provable without docker or the real `dev` binary.
 *
 * CREDENTIAL CUSTODY: the credential NEVER appears on argv (git subprocesses take
 * the auth header via env-fed `http.extraHeader`, the same env-config form the
 * cloud mirror uses) nor in any emitted event. The clone URL carries no secret.
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

const LOG_TAIL_CAP = 4096;

/**
 * gitCredentialEnv injects the agent credential as an HTTP basic-auth header via
 * git's env-based config (GIT_CONFIG_* — NOT argv), so the token never appears in
 * a process listing or a log. GIT_TERMINAL_PROMPT=0 makes a missing/invalid
 * credential fail closed instead of hanging on a prompt.
 */
function gitCredentialEnv(cred: Credential): NodeJS.ProcessEnv {
  const basic = Buffer.from(`${cred.username}:${cred.token}`).toString("base64");
  return {
    GIT_TERMINAL_PROMPT: "0",
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "http.extraHeader",
    GIT_CONFIG_VALUE_0: `Authorization: Basic ${basic}`,
  };
}

function fail(emit: (e: CodingEvent) => void, message: string, logTail = ""): CodingEvent {
  const ev: CodingEvent = { type: "error", ok: false, message, logTail };
  emit(ev);
  return ev;
}

/**
 * runCodingTask executes one coding job and returns the terminal event (result or
 * error). Every phase emits progress. The credential env is applied ONLY to the
 * two network git commands (clone, push); the agent and local git run without it.
 */
export async function runCodingTask(
  params: CodingTaskParams,
  deps: CodingDeps,
  emit: (e: CodingEvent) => void,
): Promise<CodingEvent> {
  const { exec, runAgent } = deps;
  const repoDir = join(params.workdir, "repo");
  const netEnv = { ...process.env, ...gitCredentialEnv(params.credential) };
  const localEnv = { ...process.env, GIT_TERMINAL_PROMPT: "0" };
  const timeoutMs = Math.max(60, params.runTimeoutSeconds) * 1000;

  // 1. shallow clone (no secret on argv; auth via env http.extraHeader).
  emit({ type: "step", step: "clone", status: "start" });
  const cloneArgs = ["clone", "--depth", "1", "--single-branch"];
  if (params.baseBranch) cloneArgs.push("--branch", params.baseBranch);
  cloneArgs.push(params.cloneUrl, repoDir);
  const clone = await exec(["git", ...cloneArgs], { cwd: params.workdir, env: netEnv, timeoutMs });
  if (clone.code !== 0) return fail(emit, "clone failed", tail(clone.stderr));
  emit({ type: "step", step: "clone", status: "ok" });

  // 2. fresh working branch (never reuses/forces an existing ref).
  const co = await exec(["git", "checkout", "-b", params.branch], { cwd: repoDir, env: localEnv });
  if (co.code !== 0) return fail(emit, "could not create branch", tail(co.stderr));

  // 3. the coding agent edits the tree (workspace-write).
  emit({ type: "step", step: "code", status: "start" });
  const agent = await runAgent({ cwd: repoDir, prompt: params.prompt, timeoutMs }, emit);
  emit({ type: "step", step: "code", status: agent.ok ? "ok" : "error" });
  if (!agent.ok) return fail(emit, "coding step failed", agent.logTail);

  // 4. stage + detect changes. No changes is a clean, non-error outcome.
  await exec(["git", "add", "-A"], { cwd: repoDir, env: localEnv });
  const status = await exec(["git", "status", "--porcelain"], { cwd: repoDir, env: localEnv });
  if (status.stdout.trim() === "") {
    const ev: CodingEvent = { type: "result", ok: true, changed: false, branch: params.branch, logTail: agent.logTail };
    emit(ev);
    return ev;
  }

  // 5. commit (fixed identity; the run's attribution lives in the cloud session).
  const commit = await exec(
    ["git", "-c", "user.name=Hanzo Agent", "-c", "user.email=agent@hanzo.ai", "commit", "-m", commitMessage(params.prompt)],
    { cwd: repoDir, env: localEnv },
  );
  if (commit.code !== 0) return fail(emit, "commit failed", tail(commit.stderr));
  const sha = (await exec(["git", "rev-parse", "HEAD"], { cwd: repoDir, env: localEnv })).stdout.trim();
  const diffstat = (await exec(["git", "show", "--stat", "--format=", "HEAD"], { cwd: repoDir, env: localEnv })).stdout.trim();

  // 6. push the new branch (plain, non-fast-forward-safe: fresh ref; never --force,
  // never a delete). Auth again via env http.extraHeader.
  emit({ type: "step", step: "push", status: "start" });
  const push = await exec(["git", "push", "origin", `HEAD:refs/heads/${params.branch}`], { cwd: repoDir, env: netEnv, timeoutMs });
  if (push.code !== 0) return fail(emit, "push failed", tail(push.stderr));
  emit({ type: "step", step: "push", status: "ok" });

  const ev: CodingEvent = {
    type: "result", ok: true, changed: true, branch: params.branch,
    commitSha: sha, diffstat, logTail: agent.logTail,
  };
  emit(ev);
  return ev;
}

function commitMessage(prompt: string): string {
  const first = prompt.split("\n", 1)[0]!.trim();
  const subject = first.length > 72 ? first.slice(0, 69) + "..." : first || "agent changes";
  return `${subject}\n\nOpened by the @hanzo coding agent.`;
}

function tail(s: string): string {
  s = (s ?? "").trim();
  return s.length > LOG_TAIL_CAP ? s.slice(-LOG_TAIL_CAP) : s;
}

// ── production runtime pieces (sandbox-agnostic: swap hostExecFn for a docker
// exec to gain per-task container isolation — see coding-tasks-http.ts) ────────

/** hostExecFn runs commands on the host via execFile (argv only, no shell). */
export function hostExecFn(): ExecFn {
  return (argv, opts) =>
    new Promise<ExecResult>((resolve) => {
      const [cmd, ...args] = argv;
      execFile(
        cmd!,
        args,
        { cwd: opts.cwd, env: opts.env, timeout: opts.timeoutMs, maxBuffer: 64 * 1024 * 1024 },
        (err, stdout, stderr) => {
          const code =
            err && typeof (err as { code?: unknown }).code === "number"
              ? ((err as { code: number }).code)
              : err
                ? 1
                : 0;
          resolve({ stdout: stdout?.toString() ?? "", stderr: stderr?.toString() ?? "", code });
        },
      );
    });
}

/**
 * devAgentRunner runs `dev exec --sandbox workspace-write --json <prompt>` in cwd,
 * streaming its JSONL to log events. command defaults to "dev" (the hanzo/dev
 * codex fork). ok is the exit-zero of the process; logTail is the trailing output.
 */
export function devAgentRunner(command = "dev"): AgentRunner {
  return ({ cwd, prompt, timeoutMs }, emit) =>
    new Promise((resolve) => {
      const argv = ["exec", "--sandbox", "workspace-write", "--json", "--skip-git-repo-check", prompt];
      const child = spawn(command, argv, { cwd, env: { ...process.env }, stdio: ["ignore", "pipe", "pipe"] });
      let out = "";
      const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
      child.stdout.on("data", (b: Buffer) => {
        out += b.toString();
        for (const line of b.toString().split("\n")) {
          const t = line.trim();
          if (t) emit({ type: "log", message: t.slice(0, 500) });
        }
        if (out.length > 1 << 20) out = out.slice(-(1 << 20));
      });
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

/**
 * makeHostWorkdir creates a fresh, unique temp working directory for one run and a
 * disposer that recursively removes it. The whole run is confined to this dir; the
 * disposer runs in the handler's finally so no clone lingers on disk.
 */
export async function makeHostWorkdir(): Promise<{ dir: string; cleanup: () => Promise<void> }> {
  const dir = await mkdtemp(join(tmpdir(), "hanzo-coding-"));
  return { dir, cleanup: async () => rm(dir, { recursive: true, force: true }).catch(() => {}) };
}
