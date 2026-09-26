import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExecApprovalsResolved } from "../infra/exec-approvals.js";

vi.mock("../infra/shell-env.js", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../infra/shell-env.js")>();
  return { ...mod, getShellPathFromLoginShell: vi.fn(() => null) };
});

// The host's approvals file sets nothing: the config's security and ask are the policy.
vi.mock("../infra/exec-approvals.js", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../infra/exec-approvals.js")>();
  return {
    ...mod,
    resolveExecApprovals: (
      _agentId?: string,
      overrides?: { security?: string; ask?: string },
    ): ExecApprovalsResolved => {
      const agent = {
        security: (overrides?.security ?? "deny") as "deny",
        ask: (overrides?.ask ?? "on-miss") as "on-miss",
        askFallback: "deny" as const,
        autoAllowSkills: false,
      };
      return {
        path: "/tmp/exec-approvals.json",
        socketPath: "/tmp/exec-approvals.sock",
        token: "token",
        defaults: agent,
        agent,
        allowlist: [],
        file: { version: 1, agents: {} },
      };
    },
  };
});

const { createExecTool } = await import("./bash-tools.exec.js");

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "exec-security-"));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const run = (tool: ReturnType<typeof createExecTool>, args: Record<string, unknown> = {}) =>
  tool.execute("call", { command: "echo ran", ...args });

// RED-BOTEXEC-3 and the owner's rule: exec with no real sandbox is host exec,
// held to tools.exec.security and ask exactly as the gateway path holds them.
describe("exec without a sandbox", () => {
  it("is denied when tools.exec.security is unset (DEFAULT_SECURITY deny)", async () => {
    await expect(run(createExecTool({ cwd: dir }))).rejects.toThrow(
      "exec denied: host=gateway security=deny",
    );
  });

  it("is denied when tools.exec.security is deny", async () => {
    await expect(run(createExecTool({ cwd: dir, security: "deny", ask: "off" }))).rejects.toThrow(
      "exec denied: host=gateway security=deny",
    );
  });

  it("runs where tools.exec.security allows it", async () => {
    const result = await run(createExecTool({ cwd: dir, security: "full", ask: "off" }));
    expect((result.details as { status?: string }).status).toBe("completed");
  });

  it("holds an allowlist as the gateway does", async () => {
    await expect(
      run(createExecTool({ cwd: dir, security: "allowlist", ask: "off" }), { command: "id" }),
    ).rejects.toThrow("exec denied: allowlist miss");
  });
});

describe("exec in a sandbox", () => {
  // OpenClaw throws on an explicit deny in the sandbox too (bash-tools.exec-run.ts).
  it("is denied when tools.exec.security is deny", async () => {
    const tool = createExecTool({
      host: "sandbox",
      security: "deny",
      sandbox: { containerName: "bot-test", workspaceDir: dir, containerWorkdir: "/workspace" },
    });
    await expect(run(tool)).rejects.toThrow("exec denied: host=sandbox security=deny");
  });
});

// RED-BOTEXEC-4: elevated never lifts the configured policy, as in OpenClaw.
describe("elevated exec", () => {
  const elevated = { enabled: true, allowed: true, defaultLevel: "full" as const };

  it("is denied where tools.exec.security is deny", async () => {
    const tool = createExecTool({ cwd: dir, security: "deny", ask: "off", elevated });
    await expect(run(tool)).rejects.toThrow("exec denied: host=gateway security=deny");
  });

  it("does not raise an allowlist to full", async () => {
    const tool = createExecTool({ cwd: dir, security: "allowlist", ask: "off", elevated });
    await expect(run(tool, { command: "id" })).rejects.toThrow("exec denied: allowlist miss");
  });

  it("skips approvals where the policy is full with ask off", async () => {
    const tool = createExecTool({ cwd: dir, security: "full", ask: "off", elevated });
    const result = await run(tool);
    expect((result.details as { status?: string }).status).toBe("completed");
  });
});
