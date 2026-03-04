import { vi } from "vitest";

type SessionsSpawnTestConfig = ReturnType<(typeof import("../config/config.js"))["loadConfig"]>;
type CreateBotTools = (typeof import("./bot-tools.js"))["createBotTools"];
export type CreateBotToolsOpts = Parameters<CreateBotTools>[0];

// Avoid exporting vitest mock types (TS2742 under pnpm + d.ts emit).
// oxlint-disable-next-line typescript/no-explicit-any
type AnyMock = any;

const hoisted = vi.hoisted(() => {
  const callGatewayMock = vi.fn();
  const defaultConfigOverride = {
    session: {
      mainKey: "main",
      scope: "per-sender",
    },
  } as SessionsSpawnTestConfig;
  const state = { configOverride: defaultConfigOverride };
  return { callGatewayMock, defaultConfigOverride, state };
});

export function getCallGatewayMock(): AnyMock {
  return hoisted.callGatewayMock;
}

export function resetSessionsSpawnConfigOverride(): void {
  hoisted.state.configOverride = hoisted.defaultConfigOverride;
}

export function setSessionsSpawnConfigOverride(next: SessionsSpawnTestConfig): void {
  hoisted.state.configOverride = next;
}

export async function getSessionsSpawnTool(opts: CreateBotToolsOpts) {
  // Dynamic import: ensure harness mocks are installed before tool modules load.
  const { createBotTools } = await import("./bot-tools.js");
  const tool = createBotTools(opts).find((candidate) => candidate.name === "sessions_spawn");
  if (!tool) {
    throw new Error("missing sessions_spawn tool");
  }
  return tool;
}

vi.mock("../gateway/call.js", () => ({
  callGateway: (opts: unknown) => hoisted.callGatewayMock(opts),
}));
// Some tools import callGateway via "../../gateway/call.js" (from nested folders). Mock that too.
vi.mock("../../gateway/call.js", () => ({
  callGateway: (opts: unknown) => hoisted.callGatewayMock(opts),
}));

type GatewayRequest = { method?: string; params?: unknown };
type AgentWaitCall = { runId?: string; timeoutMs?: number };

export function setupSessionsSpawnGatewayMock(opts: {
  includeSessionsList?: boolean;
  includeChatHistory?: boolean;
  chatHistoryText?: string;
  onAgentSubagentSpawn?: (params: unknown) => void;
  onSessionsPatch?: (params: unknown) => void;
  onSessionsDelete?: (params: unknown) => void;
  agentWaitResult?: { status: "ok" | "timeout"; startedAt: number; endedAt: number };
}): {
  calls: Array<GatewayRequest>;
  waitCalls: Array<AgentWaitCall>;
  getChild: () => { runId?: string; sessionKey?: string };
} {
  const calls: Array<GatewayRequest> = [];
  const waitCalls: Array<AgentWaitCall> = [];
  let agentCallCount = 0;
  let childRunId: string | undefined;
  let childSessionKey: string | undefined;

  hoisted.callGatewayMock.mockImplementation(async (optsUnknown: unknown) => {
    const request = optsUnknown as GatewayRequest;
    calls.push(request);

    if (request.method === "sessions.list" && opts.includeSessionsList) {
      return {
        sessions: [
          {
            key: "main",
            lastChannel: "whatsapp",
            lastTo: "+123",
          },
        ],
      };
    }

    if (request.method === "agent") {
      agentCallCount += 1;
      const runId = `run-${agentCallCount}`;
      const params = request.params as { lane?: string; sessionKey?: string } | undefined;
      if (params?.lane === "subagent") {
        childRunId = runId;
        childSessionKey = params?.sessionKey ?? "";
        opts.onAgentSubagentSpawn?.(params);
      }
      return {
        runId,
        status: "accepted",
        acceptedAt: 1000 + agentCallCount,
      };
    }

    if (request.method === "agent.wait") {
      const params = request.params as AgentWaitCall | undefined;
      waitCalls.push(params ?? {});
      const res = opts.agentWaitResult ?? { status: "ok", startedAt: 1000, endedAt: 2000 };
      return {
        runId: params?.runId ?? "run-1",
        ...res,
      };
    }

    if (request.method === "sessions.patch") {
      opts.onSessionsPatch?.(request.params);
      return { ok: true };
    }

    if (request.method === "sessions.delete") {
      opts.onSessionsDelete?.(request.params);
      return { ok: true };
    }

    if (request.method === "chat.history" && opts.includeChatHistory) {
      return {
        messages: [
          {
            role: "assistant",
            content: [{ type: "text", text: opts.chatHistoryText ?? "done" }],
          },
        ],
      };
    }

    return {};
  });

  return {
    calls,
    waitCalls,
    getChild: () => ({ runId: childRunId, sessionKey: childSessionKey }),
  };
}

export function getGatewayMethods(): string[] {
  return hoisted.callGatewayMock.mock.calls
    .map((call: unknown[]) => {
      const opts = call[0] as { method?: string } | undefined;
      return opts?.method;
    })
    .filter((method: string | undefined): method is string => typeof method === "string");
}

export function findGatewayRequest(
  method: string,
): { method: string; params: unknown } | undefined {
  for (const call of hoisted.callGatewayMock.mock.calls) {
    const opts = (call as unknown[])[0] as { method?: string; params?: unknown } | undefined;
    if (opts?.method === method) {
      return { method: opts.method, params: opts.params };
    }
  }
  return undefined;
}

vi.mock("../config/config.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../config/config.js")>();
  return {
    ...actual,
    loadConfig: () => hoisted.state.configOverride,
    resolveGatewayPort: () => 18789,
  };
});

// Same module, different specifier (used by tools under src/agents/tools/*).
vi.mock("../../config/config.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../config/config.js")>();
  return {
    ...actual,
    loadConfig: () => hoisted.state.configOverride,
    resolveGatewayPort: () => 18789,
  };
});
