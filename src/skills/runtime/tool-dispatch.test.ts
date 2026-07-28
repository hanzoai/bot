// Skill tool dispatch tests cover policy-filtered tool surfaces.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { replaceSessionEntry } from "../../config/sessions/session-accessor.js";
import type { SessionEntry } from "../../config/sessions/types.js";
import type { BotConfig } from "../../config/types.bot.js";

type CreateBotToolsArg = {
  beforeToolCallHookContext?: {
    skillCommand?: { skillFile?: string };
  };
  cronCreatorToolAllowlist?: Array<string | { name: string; pluginId?: string }>;
  nativeChannelId?: string;
};

const hoisted = vi.hoisted(() => {
  function makeTool(name: string) {
    return {
      name,
      description: `${name} tool`,
      parameters: { type: "object", properties: {} },
      execute: vi.fn(),
    };
  }
  return {
    createBotToolsMock: vi.fn((_args: CreateBotToolsArg) => [
      makeTool("read"),
      makeTool("cron"),
      makeTool("exec"),
    ]),
  };
});

vi.mock("../../agents/bot-tools.runtime.js", () => ({
  createBotTools: (args: CreateBotToolsArg) => hoisted.createBotToolsMock(args),
}));

import { resolveSkillDispatchTools } from "./tool-dispatch.js";

describe("resolveSkillDispatchTools", () => {
  it("passes final filtered tool surface to cron jobs", () => {
    const tools = resolveSkillDispatchTools({
      message: {
        surface: "telegram",
        senderId: "user-1",
        nativeChannelId: "native-room-1",
      },
      cfg: {
        tools: { allow: ["read", "cron"] },
      } as BotConfig,
      agentId: "main",
      sessionKey: "agent:main:telegram:group:restricted-room",
      workspaceDir: "/tmp/bot-skill-tool-dispatch-test",
      provider: "openai",
      model: "gpt-5.5",
    });

    const args = hoisted.createBotToolsMock.mock.calls[0]?.[0];
    expect(tools.map((tool) => tool.name)).toEqual(["read", "cron"]);
    expect(args?.cronCreatorToolAllowlist).toEqual([{ name: "read" }, { name: "cron" }]);
    expect(args?.nativeChannelId).toBe("native-room-1");
  });

  it("passes unrestricted skill-dispatch tool surfaces to cron jobs", () => {
    const tools = resolveSkillDispatchTools({
      message: { surface: "telegram", senderId: "user-1" },
      cfg: {} as BotConfig,
      agentId: "main",
      sessionKey: "agent:main:telegram:direct:user-1",
      workspaceDir: "/tmp/bot-skill-tool-dispatch-test",
      provider: "openai",
      model: "gpt-5.5",
    });

    const args = hoisted.createBotToolsMock.mock.calls.at(-1)?.[0];
    expect(tools.map((tool) => tool.name)).toEqual(["read", "cron", "exec"]);
    expect(args?.cronCreatorToolAllowlist).toEqual([
      { name: "read" },
      { name: "cron" },
      { name: "exec" },
    ]);
  });

  it("carries command skill file identity into tool diagnostics", () => {
    resolveSkillDispatchTools({
      message: { surface: "telegram", senderId: "user-1" },
      cfg: {} as BotConfig,
      agentId: "main",
      sessionKey: "agent:main:telegram:direct:user-1",
      workspaceDir: "/tmp/bot-skill-tool-dispatch-test",
      provider: "openai",
      model: "gpt-5.5",
      skillCommand: {
        name: "daily-brief",
        skillFile: "/workspace/skills/daily-brief/SKILL.md",
        skillName: "Daily Brief",
        skillSource: "workspace",
        toolName: "read",
      },
    });

    const args = hoisted.createBotToolsMock.mock.calls.at(-1)?.[0];
    expect(args?.beforeToolCallHookContext?.skillCommand?.skillFile).toBe(
      "/workspace/skills/daily-brief/SKILL.md",
    );
  });

  it("uses persisted delegated policy instead of a sender wildcard", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bot-skill-delegated-policy-"));
    const storePath = path.join(tempDir, "sessions.json");
    const sessionKey = "agent:main:subagent:skill-child";
    await replaceSessionEntry({ storePath, sessionKey }, {
      sessionId: "skill-child-session",
      updatedAt: Date.now(),
      spawnedBy: "agent:main:telegram:direct:alice",
      spawnDepth: 1,
      subagentRole: "orchestrator",
      subagentControlScope: "children",
      inheritedToolPolicyVersion: 1,
    } as SessionEntry);

    try {
      const tools = resolveSkillDispatchTools({
        message: { surface: "telegram" },
        cfg: {
          session: { store: storePath },
          tools: {
            toolsBySender: {
              "*": { deny: ["group:runtime", "group:fs"] },
              "id:alice": {},
            },
          },
        } as BotConfig,
        agentId: "main",
        sessionKey,
        workspaceDir: "/tmp/bot-skill-tool-dispatch-test",
        provider: "openai",
        model: "gpt-5.5",
      });

      expect(tools.map((tool) => tool.name)).toEqual(expect.arrayContaining(["read", "exec"]));
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
