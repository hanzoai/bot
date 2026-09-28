import { describe, expect, it } from "vitest";
import type { BotConfig } from "../config/config.js";
import { execDeniedWithoutSandbox } from "./doctor-exec.js";

describe("execDeniedWithoutSandbox", () => {
  it("names an agent with no sandbox and no tools.exec.security", () => {
    expect(execDeniedWithoutSandbox({})).toEqual([
      '- Agent main: exec is denied: no sandbox is configured and tools.exec.security is unset. Set tools.exec.security to "allowlist" or "full" to allow it.',
    ]);
  });

  it("says only the main session where the sandbox covers the others", () => {
    const cfg = { agents: { defaults: { sandbox: { mode: "non-main" } } } } as BotConfig;
    expect(execDeniedWithoutSandbox(cfg)).toEqual([
      '- Agent main: exec is denied: no sandbox is configured for its main session and tools.exec.security is unset. Set tools.exec.security to "allowlist" or "full" to allow it.',
    ]);
  });

  it("says nothing where a security is set, the host is not the sandbox, or every session is sandboxed", () => {
    const cases: BotConfig[] = [
      { tools: { exec: { security: "full" } } },
      { tools: { exec: { security: "deny" } } },
      { tools: { exec: { host: "gateway" } } },
      { agents: { defaults: { sandbox: { mode: "all" } } } },
      { agents: { list: [{ id: "cloud-abc" }] } },
    ] as BotConfig[];
    for (const cfg of cases) {
      expect(execDeniedWithoutSandbox(cfg)).toEqual([]);
    }
  });

  it("reads each agent's own exec over the root's", () => {
    const cfg = {
      tools: { exec: { security: "full" } },
      agents: { list: [{ id: "main" }, { id: "ops", tools: { exec: { host: "sandbox" } } }] },
    } as BotConfig;
    expect(execDeniedWithoutSandbox(cfg)).toEqual([]);
    const unset = {
      agents: { list: [{ id: "main", tools: { exec: { security: "full" } } }, { id: "ops" }] },
    };
    expect(execDeniedWithoutSandbox(unset as BotConfig)).toEqual([
      '- Agent ops: exec is denied: no sandbox is configured and tools.exec.security is unset. Set tools.exec.security to "allowlist" or "full" to allow it.',
    ]);
  });
});
