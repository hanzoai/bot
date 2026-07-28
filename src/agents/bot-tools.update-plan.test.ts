// Verifies update_plan registration gates and base Bot tool inclusion policy.
import { afterEach, describe, expect, it } from "vitest";
import type { BotConfig } from "../config/config.js";
import { setEmbeddedMode } from "../infra/embedded-mode.js";
import { isToolWrappedWithBeforeToolCallHook } from "./agent-tools.before-tool-call.js";
import { resolveCoreToolFactoryFamily } from "./core-tool-factory-descriptors.js";
import { createBotTools } from "./bot-tools.js";
import {
  shouldIncludeAskUserToolForBotTools,
  shouldIncludeUpdatePlanToolForBotTools,
} from "./bot-tools.registration.js";
import { createUpdatePlanTool } from "./tools/update-plan-tool.js";

type UpdatePlanGatingParams = Parameters<typeof shouldIncludeUpdatePlanToolForBotTools>[0];
type CreateBotToolsOptions = NonNullable<Parameters<typeof createBotTools>[0]>;

function withDefaultRoster(config: BotConfig | undefined): BotConfig {
  return {
    ...config,
    agents: config?.agents ?? { entries: { main: { default: true } } },
  };
}

function expectUpdatePlanEnabled(params: UpdatePlanGatingParams, expected: boolean): void {
  expect(
    shouldIncludeUpdatePlanToolForBotTools({
      ...params,
      config: withDefaultRoster(params.config),
    }),
  ).toBe(expected);
}

function toolNames(tools: ReturnType<typeof createBotTools>): string[] {
  return tools.map((tool) => tool.name);
}

function createFastToolNames(options: CreateBotToolsOptions): string[] {
  // Disable unrelated dynamic surfaces so registration assertions stay deterministic.
  return toolNames(
    createTestBotTools({
      disableMessageTool: true,
      disablePluginTools: true,
      wrapBeforeToolCallHook: false,
      ...options,
    }),
  );
}

function createTestBotTools(options: CreateBotToolsOptions = {}) {
  return createBotTools({
    ...options,
    config: withDefaultRoster(options.config),
  });
}

function expectToolNamed(
  tools: ReturnType<typeof createBotTools>,
  name: string,
): ReturnType<typeof createBotTools>[number] {
  const tool = tools.find((candidate) => candidate.name === name);
  if (!tool) {
    throw new Error(`Expected tool ${name} to be registered`);
  }
  return tool;
}

describe("bot-tools update_plan gating", () => {
  afterEach(() => {
    setEmbeddedMode(false);
  });

  it("keeps concrete Bot tool names in the factory descriptor catalog", () => {
    const emittedNames = createFastToolNames({
      agentSessionKey: "agent:main:main",
      config: {
        tools: { allow: ["update_plan"] },
        transcripts: { enabled: true },
      } as BotConfig,
      cwd: "/repo",
      enableHeartbeatTool: true,
      taskSuggestionDeliveryMode: "gateway",
    });

    expect(
      emittedNames.filter((name) => resolveCoreToolFactoryFamily(name) !== "bot"),
    ).toEqual([]);
  });

  it("enables update_plan by default", () => {
    expectUpdatePlanEnabled({ config: {} as BotConfig }, true);
  });

  it("exposes update_plan from default tool construction for every embedded model", () => {
    const defaultTools = createFastToolNames({
      config: {} as BotConfig,
      modelProvider: "anthropic",
      modelId: "claude-sonnet-4-6",
    });

    expect(defaultTools).toContain("update_plan");
    expect(defaultTools).not.toContain("ask_user");
  });

  it("keeps ask_user on primary sessions and excludes spawned worker sessions", () => {
    expect(shouldIncludeAskUserToolForBotTools({})).toBe(false);
    expect(shouldIncludeAskUserToolForBotTools({ agentSessionKey: "agent:main:main" })).toBe(
      true,
    );
    expect(
      shouldIncludeAskUserToolForBotTools({
        agentSessionKey: "agent:main:subagent:worker",
      }),
    ).toBe(false);
    expect(
      shouldIncludeAskUserToolForBotTools({ agentSessionKey: "agent:main:acp:worker" }),
    ).toBe(false);
    // ask_user must not depend on the TUI embedded-host flag; normal gateway
    // runs are the primary consumer.
    expect(
      createFastToolNames({
        config: {} as BotConfig,
        runSessionKey: "agent:main:non-embedded",
      }),
    ).toContain("ask_user");
    setEmbeddedMode(true);

    expect(
      createFastToolNames({
        config: {} as BotConfig,
        agentSessionKey: "agent:main:subagent:worker",
      }),
    ).not.toContain("ask_user");
    expect(
      createFastToolNames({
        config: {} as BotConfig,
        runSessionKey: "agent:main:run",
      }),
    ).toContain("ask_user");
  });

  it("wraps constructed tools with before-tool-call hooks by default", () => {
    const tools = createTestBotTools({
      config: {} as BotConfig,
      disablePluginTools: true,
    });
    const unwrappedTools = createTestBotTools({
      config: {} as BotConfig,
      disablePluginTools: true,
      wrapBeforeToolCallHook: false,
    });

    expect(isToolWrappedWithBeforeToolCallHook(expectToolNamed(tools, "sessions_list"))).toBe(true);
    expect(
      isToolWrappedWithBeforeToolCallHook(expectToolNamed(unwrappedTools, "sessions_list")),
    ).toBe(false);
  });

  it("keeps message tool in embedded message-tool-only completions", () => {
    setEmbeddedMode(true);
    const tools = createTestBotTools({
      config: {} as BotConfig,
      disablePluginTools: true,
      wrapBeforeToolCallHook: false,
      sourceReplyDeliveryMode: "message_tool_only",
    });

    expect(toolNames(tools)).toContain("message");
  });

  it("exposes delegation only to regular unsandboxed gateway agents", () => {
    const regular = createFastToolNames({
      config: {} as BotConfig,
      agentSessionKey: "agent:main:main",
    });
    const sandboxed = createFastToolNames({
      config: {} as BotConfig,
      agentSessionKey: "agent:main:main",
      sandboxed: true,
    });
    const system = createFastToolNames({
      config: {} as BotConfig,
      agentSessionKey: "agent:bot:main",
    });
    setEmbeddedMode(true);
    const embedded = createFastToolNames({
      config: {} as BotConfig,
      agentSessionKey: "agent:main:main",
    });

    expect(regular).toContain("bot");
    expect(sandboxed).not.toContain("bot");
    expect(system).not.toContain("bot");
    expect(embedded).not.toContain("bot");
  });

  it("registers transcripts by default with an explicit global opt-out", () => {
    const defaultTools = createFastToolNames({
      config: {} as BotConfig,
    });
    const disabledTools = createFastToolNames({
      config: { transcripts: { enabled: false } } as BotConfig,
    });

    expect(defaultTools).toContain("transcripts");
    expect(disabledTools).not.toContain("transcripts");
  });

  it("registers task suggestions only for sessions with an actionable gateway sink", () => {
    const withoutSession = createFastToolNames({
      config: {} as BotConfig,
      cwd: "/repo",
      taskSuggestionDeliveryMode: "gateway",
    });
    const withoutSink = createFastToolNames({
      config: {} as BotConfig,
      agentSessionKey: "agent:main:main",
      cwd: "/repo",
    });
    const withSink = createFastToolNames({
      config: {} as BotConfig,
      agentSessionKey: "agent:main:main",
      cwd: "/repo",
      taskSuggestionDeliveryMode: "gateway",
    });

    expect(withoutSession).not.toContain("spawn_task");
    expect(withoutSession).not.toContain("dismiss_task");
    expect(withoutSink).not.toContain("spawn_task");
    expect(withoutSink).not.toContain("dismiss_task");
    expect(withSink).toEqual(expect.arrayContaining(["spawn_task", "dismiss_task"]));
  });

  it("keeps explicitly allowed message tool in embedded completions", () => {
    setEmbeddedMode(true);
    const fromRuntimeAllowlist = createTestBotTools({
      config: {} as BotConfig,
      disablePluginTools: true,
      pluginToolAllowlist: ["message"],
      wrapBeforeToolCallHook: false,
    });
    const fromGlobalAlsoAllow = createTestBotTools({
      config: { tools: { profile: "minimal", alsoAllow: ["message"] } } as BotConfig,
      disablePluginTools: true,
      wrapBeforeToolCallHook: false,
    });
    const denied = createTestBotTools({
      config: {} as BotConfig,
      disablePluginTools: true,
      pluginToolAllowlist: ["message"],
      pluginToolDenylist: ["message"],
      wrapBeforeToolCallHook: false,
    });

    expect(toolNames(fromRuntimeAllowlist)).toContain("message");
    expect(toolNames(fromGlobalAlsoAllow)).toContain("message");
    expect(toolNames(denied)).not.toContain("message");
  });

  it("keeps subagent spawn available for trusted embedded gateway-bound runs", () => {
    setEmbeddedMode(true);
    const defaultTools = createFastToolNames({
      config: {} as BotConfig,
    });
    const gatewayBoundTools = createFastToolNames({
      config: {} as BotConfig,
      allowGatewaySubagentBinding: true,
    });

    expect(defaultTools).not.toContain("sessions_spawn");
    expect(defaultTools).not.toContain("sessions_send");
    expect(gatewayBoundTools).toContain("sessions_spawn");
    expect(gatewayBoundTools).not.toContain("sessions_send");
  });

  it("registers update_plan when explicitly enabled", () => {
    const config = { tools: { updatePlan: true } } as BotConfig;

    expectUpdatePlanEnabled({ config }, true);
    expect(createUpdatePlanTool().displaySummary).toBe("Track short work plan.");
  });

  it("registers update_plan when the runtime allowlist explicitly requests it", () => {
    const tools = createFastToolNames({
      config: {} as BotConfig,
      pluginToolAllowlist: ["update_plan"],
      modelProvider: "anthropic",
      modelId: "claude-sonnet-4-6",
    });

    expect(tools).toContain("update_plan");
  });

  it("includes update_plan when a config allowlist group includes it", () => {
    const includeUpdatePlan = shouldIncludeUpdatePlanToolForBotTools({
      config: { tools: { allow: ["group:agents"] } } as BotConfig,
    });

    expect(includeUpdatePlan).toBe(true);
  });

  it("leaves normal deny policy enforcement to the assembled tool set", () => {
    const tools = createFastToolNames({
      config: {} as BotConfig,
      pluginToolAllowlist: ["group:agents"],
      pluginToolDenylist: ["update_plan"],
      modelProvider: "anthropic",
      modelId: "claude-sonnet-4-6",
    });

    expect(tools).not.toContain("update_plan");
  });

  it("lets an explicit updatePlan false override an allowlist that includes the tool", () => {
    expectUpdatePlanEnabled(
      { config: { tools: { updatePlan: false, allow: ["update_plan"] } } as BotConfig },
      false,
    );
  });
});
