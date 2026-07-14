import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type CodingEvent,
  type ExecFn,
  hostExecFn,
  runCodingTask,
} from "./coding-task.js";

// These tests prove the clone→edit→commit→push wrapper against a REAL local bare
// git repo with a STUB coding step (the `dev` binary need not be present). git is
// the same dependency the rest of the gateway git tooling relies on.

const SECRET = "hk-SUPERSECRETtoken";

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"] }).toString();
}

let tmp: string;
let bare: string;

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), "coding-task-test-"));
  bare = join(tmp, "origin.git");
  execFileSync("git", ["init", "--bare", "-b", "main", bare]);
  // Seed the bare repo with an initial commit on main.
  const seed = join(tmp, "seed");
  execFileSync("git", ["clone", bare, seed]);
  writeFileSync(join(seed, "README.md"), "seed\n");
  git(seed, "add", "-A");
  git(seed, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-m", "init");
  git(seed, "push", "origin", "main");
});

afterAll(() => {
  execFileSync("rm", ["-rf", tmp]);
});

// recordingExec wraps hostExecFn and captures every argv so a test can assert the
// credential is never placed on a command line.
function recordingExec(log: string[][]): ExecFn {
  const host = hostExecFn();
  return (argv, opts) => {
    log.push(argv);
    return host(argv, opts);
  };
}

describe("runCodingTask", () => {
  it("clones, edits, commits, and pushes a fresh branch — credential never on argv", async () => {
    const workdir = join(tmp, "work-happy");
    mkdirSync(workdir);
    const argvLog: string[][] = [];
    const events: CodingEvent[] = [];

    const stubAgent = async (
      { cwd }: { cwd: string; prompt: string; timeoutMs: number },
      emit: (e: CodingEvent) => void,
    ) => {
      writeFileSync(join(cwd, "feature.txt"), "the agent's change\n");
      emit({ type: "log", message: "stub edited feature.txt" });
      return { ok: true, logTail: "stub agent done" };
    };

    const result = await runCodingTask(
      {
        cloneUrl: bare, // a local path — the runner is transport-agnostic
        baseBranch: "main",
        branch: "agent/happy1",
        prompt: "add a feature file",
        credential: { username: "x-access-token", token: SECRET },
        workdir,
        runTimeoutSeconds: 120,
      },
      { exec: recordingExec(argvLog), runAgent: stubAgent },
      (e) => events.push(e),
    );

    expect(result.type).toBe("result");
    expect(result.ok).toBe(true);
    expect(result.changed).toBe(true);
    expect(result.branch).toBe("agent/happy1");
    expect(result.commitSha).toMatch(/^[0-9a-f]{40}$/);

    // The branch actually landed in the origin bare repo.
    const remoteRefs = git(bare, "for-each-ref", "--format=%(refname)", "refs/heads/");
    expect(remoteRefs).toContain("refs/heads/agent/happy1");

    // The credential is NEVER on any argv (it rides env http.extraHeader only).
    for (const argv of argvLog) {
      expect(argv.join("\x00")).not.toContain("SUPERSECRET");
    }

    // Progress vocabulary: clone + code + push steps, and no raw secret in events.
    const steps = events.filter((e) => e.type === "step").map((e) => e.step);
    expect(steps).toEqual(expect.arrayContaining(["clone", "code", "push"]));
    expect(JSON.stringify(events)).not.toContain("SUPERSECRET");
  });

  it("reports changed=false and does NOT push when the agent makes no edits", async () => {
    const workdir = join(tmp, "work-nochange");
    mkdirSync(workdir);
    const noopAgent = async () => ({ ok: true, logTail: "nothing to do" });
    const result = await runCodingTask(
      {
        cloneUrl: bare,
        baseBranch: "main",
        branch: "agent/nochange1",
        prompt: "do nothing",
        credential: { username: "x", token: SECRET },
        workdir,
        runTimeoutSeconds: 120,
      },
      { exec: hostExecFn(), runAgent: noopAgent },
      () => {},
    );
    expect(result.ok).toBe(true);
    expect(result.changed).toBe(false);
    const remoteRefs = git(bare, "for-each-ref", "--format=%(refname)", "refs/heads/");
    expect(remoteRefs).not.toContain("refs/heads/agent/nochange1");
  });

  it("fails closed when the agent step fails (no commit, no push)", async () => {
    const workdir = join(tmp, "work-fail");
    mkdirSync(workdir);
    const failingAgent = async () => ({ ok: false, logTail: "agent crashed" });
    const result = await runCodingTask(
      {
        cloneUrl: bare,
        baseBranch: "main",
        branch: "agent/fail1",
        prompt: "x",
        credential: { username: "x", token: SECRET },
        workdir,
        runTimeoutSeconds: 120,
      },
      { exec: hostExecFn(), runAgent: failingAgent },
      () => {},
    );
    expect(result.type).toBe("error");
    expect(result.ok).toBe(false);
    const remoteRefs = git(bare, "for-each-ref", "--format=%(refname)", "refs/heads/");
    expect(remoteRefs).not.toContain("refs/heads/agent/fail1");
  });
});
