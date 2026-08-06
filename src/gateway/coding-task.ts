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

/**
 * TOOLS is the whole of what `tool` means: a name from the wire, an argv inside
 * the sandbox. A DATA TABLE, not a switch — every runner (host, docker) reads
 * this one map, so there is no second place where "what does `claude` run"
 * could answer differently.
 *
 * All five say "you are already confined, stop asking":
 *   dev/codex  — `--sandbox workspace-write` / `--dangerously-bypass-approvals-and-sandbox`
 *   claude     — `--dangerously-skip-permissions`
 * That is honest here and ONLY here. The container is the boundary; a second,
 * in-process approval prompt inside a box that has already dropped every
 * capability buys nothing and hangs a non-interactive run forever.
 *
 * `python` and `node` are not agents. They run the prompt AS A PROGRAM — the
 * bare-exec case, same sandbox, no model in the loop.
 */
export const TOOLS = {
  dev: (prompt: string) => [
    "dev",
    "exec",
    "--sandbox",
    "workspace-write",
    "--json",
    "--skip-git-repo-check",
    prompt,
  ],
  claude: (prompt: string) => [
    "claude",
    "--print",
    "--dangerously-skip-permissions",
    "--output-format",
    "stream-json",
    "--verbose",
    prompt,
  ],
  codex: (prompt: string) => [
    "codex",
    "exec",
    "--dangerously-bypass-approvals-and-sandbox",
    "--skip-git-repo-check",
    "--json",
    prompt,
  ],
  python: (prompt: string) => ["python3", "-c", prompt],
  node: (prompt: string) => ["node", "-e", prompt],
} satisfies Record<string, (prompt: string) => string[]>;

export type Tool = keyof typeof TOOLS;
export const DEFAULT_TOOL: Tool = "dev";
export const TOOL_NAMES = Object.keys(TOOLS) as Tool[];

/** isTool narrows an untrusted wire string to a name the table actually has. */
export function isTool(v: unknown): v is Tool {
  return typeof v === "string" && Object.hasOwn(TOOLS, v);
}

/** A run's git half. Absent => the run has no repo and NO CREDENTIAL EXISTS. */
export type RepoGrant = {
  cloneUrl: string;
  baseBranch: string;
  branch: string;
  credential: Credential;
};

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
  prompt: string;
  tool: Tool;
  workdir: string;
  runTimeoutSeconds: number;
  /**
   * repo is OPTIONAL, and its absence is the point: with no repo there is no
   * clone, no branch, no push — and no credential anywhere in the run, because
   * the only field that could carry one lives inside this object.
   */
  repo?: RepoGrant;
};

/** Runs one tool in cwd against prompt, streaming log lines via emit. */
export type AgentRunner = (
  args: { cwd: string; prompt: string; tool: Tool; timeoutMs: number },
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
 * runCodingTask executes one run and returns the terminal event.
 *
 * THE SHAPE IS: [clone] → run the tool → [commit, push]. The brackets are the
 * repo, and it is optional. A run with no repo is not a lesser coding task; it
 * is the same computer with nothing checked out into it — which is what deep
 * research and a bare `python` snippet want. Git is a CAPABILITY of a run, not
 * the shape of one, so it wraps the tool step instead of being braided through it.
 *
 * The git credential env is applied ONLY to the two network commands (clone,
 * push); the tool and local git run under a minimal, credential-free env.
 */
export async function runCodingTask(
  params: CodingTaskParams,
  deps: CodingDeps,
  emit: (e: CodingEvent) => void,
): Promise<CodingEvent> {
  const { exec, runAgent } = deps;
  const repo = params.repo;
  const localEnv = buildGitEnv();
  const timeoutMs = Math.max(60, params.runTimeoutSeconds) * 1000;

  // Where the tool runs: the checkout when there is a repo, the bare workdir
  // when there is not.
  let cwd = params.workdir;

  if (repo) {
    const repoDir = join(params.workdir, "repo");
    const netEnv = buildGitEnv(repo.credential);

    // 1. shallow clone (secret via env http.extraHeader; redirects disabled).
    emit({ type: "step", step: "clone", status: "start" });
    const cloneArgs = ["git", ...GIT_NET_HARDENING, "clone", "--depth", "1", "--single-branch"];
    if (repo.baseBranch) {
      cloneArgs.push("--branch", repo.baseBranch);
    }
    cloneArgs.push(repo.cloneUrl, repoDir);
    const clone = await exec(cloneArgs, { cwd: params.workdir, env: netEnv, timeoutMs });
    if (clone.code !== 0) {
      return fail(emit, "clone failed", tail(clone.stderr));
    }
    emit({ type: "step", step: "clone", status: "ok" });

    // 2. fresh working branch (never reuses/forces an existing ref).
    const co = await exec(["git", "checkout", "-b", repo.branch], { cwd: repoDir, env: localEnv });
    if (co.code !== 0) {
      return fail(emit, "could not create branch", tail(co.stderr));
    }
    cwd = repoDir;
  }

  // 3. the tool does the work under a minimal env.
  emit({ type: "step", step: "code", status: "start" });
  const agent = await runAgent({ cwd, prompt: params.prompt, tool: params.tool, timeoutMs }, emit);
  emit({ type: "step", step: "code", status: agent.ok ? "ok" : "error" });
  if (!agent.ok) {
    return fail(emit, "coding step failed", agent.logTail);
  }

  // No repo: the tool's output IS the result. Nothing to diff, nothing to push.
  if (!repo) {
    const ev: CodingEvent = { type: "result", ok: true, changed: false, logTail: agent.logTail };
    emit(ev);
    return ev;
  }
  const repoDir = cwd;

  // 4. stage + detect changes. No changes is a clean, non-error outcome.
  await exec(["git", "add", "-A"], { cwd: repoDir, env: localEnv });
  const status = await exec(["git", "status", "--porcelain"], { cwd: repoDir, env: localEnv });
  if (status.stdout.trim() === "") {
    const ev: CodingEvent = {
      type: "result",
      ok: true,
      changed: false,
      branch: repo.branch,
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
    ["git", ...GIT_NET_HARDENING, "push", "origin", `HEAD:refs/heads/${repo.branch}`],
    { cwd: repoDir, env: buildGitEnv(repo.credential), timeoutMs },
  );
  if (push.code !== 0) {
    return fail(emit, "push failed", tail(push.stderr));
  }
  emit({ type: "step", step: "push", status: "ok" });

  const ev: CodingEvent = {
    type: "result",
    ok: true,
    changed: true,
    branch: repo.branch,
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
 * devAgentRunner runs the run's tool (TOOLS) in cwd under a MINIMAL, secret-free
 * env (buildAgentEnv). `override` replaces argv[0] — the seam a test uses to
 * point `dev` at a stub binary without inventing a second argv shape.
 */
export function devAgentRunner(override?: string): AgentRunner {
  return ({ cwd, prompt, tool, timeoutMs }, emit) => {
    const [cmd, ...args] = TOOLS[tool](prompt);
    return spawnStreaming(override ?? cmd, args, buildAgentEnv(), cwd, timeoutMs, emit);
  };
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
 * SANDBOX_IMAGE names the image REPO. The tag is the CLASS, and that is the one
 * mechanism — cloud's apps/sandbox composes `<repo>:<class>` the same way, and
 * the class is also the pod label, so there is one vocabulary end to end.
 *
 * OLD NAMES ARE ACCEPTED FOR ONE RELEASE AND THEN DELETED. They are not
 * permanent aliases: two live names for one knob is how a deployment half-lands
 * and nobody can say which value won. `HANZO_CODING_*` is wrong by
 * construction anyway — deep research and bare exec want the same sandbox, and
 * neither is coding.
 */
export function sandboxEnv(name: string, legacy: string): string {
  return (process.env[name] ?? process.env[legacy] ?? "").trim();
}

/**
 * imageFor resolves one class to a ref THE BUILD LANE ACTUALLY PUBLISHES, which
 * is the whole difficulty and is worth writing down because guessing it wrong is
 * invisible until a pod cannot pull.
 *
 * hanzoai/ci `.hanzo/workflows/build.yml` composes every tag from an image
 * entry's `tag-suffix` and emits exactly three per build:
 *
 *     sha-<short>-amd64-<class>      <class>-latest       <version>-<class>
 *
 * Note the ORDER FLIPS: the floating tag is `<class>-latest` (class first) and
 * the pinned one is `<version>-<class>` (class last). That asymmetry is the
 * producer's, not ours — `${sfx:+$sfx-}latest` vs `${sfx:+-$sfx}` — and there is
 * no code path in that lane that emits a BARE `<class>` tag at all. So
 * `<repo>:dev`, the obvious-looking name, is a tag nothing can ever create; ours
 * exists in the registry today only because something pushed it out of band, and
 * what it contains is a stock node:22.
 *
 * Hence: pin a version with SANDBOX_IMAGE_TAG and get `<version>-<class>`;
 * leave it unset and get `<class>-latest`. Both are names the lane publishes.
 *
 * A configured value MAY still carry a tag (an old HANZO_CODING_SANDBOX_IMAGE
 * did); it named a class, so it is replaced. The scan starts after the last "/"
 * so a registry port (`host:5000/org/img`) is not mistaken for a tag.
 *
 * A DIGEST PIN IS REFUSED FOR A NON-DEFAULT CLASS, and that is not pedantry: a
 * digest names exactly one image, so "this exact image, but the desktop one" is
 * two answers to one question. Running it headless anyway would hand a run a
 * screen it was promised and does not have, and the model would spend its whole
 * budget wondering why the window never opened.
 */
export function imageFor(configured: string, cls: string, version = ""): string {
  if (configured.includes("@")) {
    if (cls !== DEFAULT_CLASS) {
      throw new Error(`sandbox image is digest-pinned, so class ${cls} cannot be selected`);
    }
    return configured;
  }
  const slash = configured.lastIndexOf("/");
  const colon = configured.indexOf(":", slash + 1);
  const repo = colon >= 0 ? configured.slice(0, colon) : configured;
  const v = version.trim();
  return v ? `${repo}:${v}-${cls}` : `${repo}:${cls}-latest`;
}

/** The two classes a run can ask for. `desktop` is a TAG, never a code path. */
const DEFAULT_CLASS = "dev";
const DESKTOP_CLASS = "desktop";

export type RuntimeSpec = {
  timeoutSec: number;
  /** desktop selects the xvfb image variant — the tag, and nothing else. */
  desktop: boolean;
};

/**
 * createDockerRuntime boots a per-task container that is the real isolation
 * boundary: the model-driven tool cannot see the pod env, the pod
 * service-account token (never mounted), or another tenant's clone.
 *
 *   - MINIMAL env: only the allowlisted names cross into the container (`-e`);
 *     BOT_GATEWAY_TOKEN and every pod secret stay on the host.
 *   - PRIVATE fs: /work and /tmp are per-container tmpfs (nosuid), so a clone is
 *     never visible to another task and vanishes on teardown.
 *   - NO service-account token: a fresh `docker run` does not mount the pod's
 *     /var/run/secrets, so the SA token is unreachable.
 *   - EGRESS: pinned to SANDBOX_NETWORK when set. UNSET MEANS THE DEFAULT
 *     BRIDGE, WHICH IS THE WHOLE INTERNET. A browser is an egress channel by
 *     definition, so this is the field that decides whether a prompt-injected
 *     run can post what it read to an attacker. It is a deployment value, not a
 *     code path — see LLM.md.
 *
 * WHAT THE BROWSER NEEDS, AND WHY IT IS HERE RATHER THAN IN THE IMAGE:
 *   - `--shm-size=1g`. Docker's default /dev/shm is 64 MiB. Chromium maps its
 *     renderer heaps there and dies part-way through a page load when it runs
 *     out — as a renderer crash, not an out-of-space error, so it reads like a
 *     flaky site. This is the single most common containerised-Chromium bug and
 *     it cannot be fixed from inside the image.
 *   - `--init`. A browser forks a tree of zygote and renderer processes; without
 *     a reaper at PID 1 their zombies accumulate for the life of the container.
 *     (The image has tini for its own CMD; `docker exec` children are not under it.)
 *
 * FAIL CLOSED: an unavailable docker daemon OR an unset sandbox image throws — the
 * handler refuses the run rather than falling back to the shared host.
 */
export async function createDockerRuntime(spec: RuntimeSpec): Promise<CodingRuntime> {
  const configured = sandboxEnv("SANDBOX_IMAGE", "HANZO_CODING_SANDBOX_IMAGE");
  if (!configured) {
    throw new Error("sandbox image is not configured (SANDBOX_IMAGE)");
  }
  const image = imageFor(
    configured,
    spec.desktop ? DESKTOP_CLASS : DEFAULT_CLASS,
    process.env.SANDBOX_IMAGE_TAG ?? "",
  );
  const ver = await docker(["version", "--format", "{{.Server.Version}}"], 10_000);
  if (ver.code !== 0) {
    throw new Error("container runtime unavailable");
  }

  const ttl = Math.max(120, spec.timeoutSec + 120);
  const runArgs = [
    "run",
    "-d",
    "--rm",
    "--init",
    "--shm-size=1g",
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
    "-e",
    `SANDBOX_TTL_SECONDS=${ttl}`,
  ];
  const net = sandboxEnv("SANDBOX_NETWORK", "HANZO_CODING_SANDBOX_NETWORK");
  if (net) {
    runArgs.push("--network", net);
  }
  const runtimeClass = (process.env.SANDBOX_RUNTIME_CLASS ?? "").trim();
  if (runtimeClass) {
    // ONE FIELD, and it is the only thing that decides how hard the boundary is:
    // runc (fastest, weakest), gvisor, or a Firecracker/Kata class. A deployment
    // value — there is no fork in code here and there must never be one.
    runArgs.push("--runtime", runtimeClass);
  }
  for (const [k, v] of Object.entries(buildAgentEnv())) {
    if (k === "HOME") {
      continue;
    } // container HOME is /work
    if (v !== undefined) {
      runArgs.push("-e", `${k}=${v}`);
    }
  }
  // The command is EXPLICIT for both classes rather than the image's CMD. A tag
  // is a mutable name: `sandbox:dev` in our own registry once resolved to a
  // stock `node:22` whose CMD is `node`, which starts, reads EOF and exits 0 —
  // a container that "ran fine" and did nothing. Naming the command means a
  // wrong image fails loudly instead of quietly.
  runArgs.push(image, ...(spec.desktop ? ["sandbox-desktop"] : ["sleep", String(ttl)]));

  const created = await docker(runArgs, 120_000);
  if (created.code !== 0) {
    throw new Error("could not start sandbox");
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
  const runAgent: AgentRunner = ({ cwd, prompt, tool, timeoutMs }, emit) =>
    spawnStreaming(
      "docker",
      ["exec", "-w", cwd, id, ...TOOLS[tool](prompt)],
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
