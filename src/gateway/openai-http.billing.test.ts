import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getTier } from "./billing/iam-billing-client.js";
import { agentCommand, getFreePort, installGatewayTestHooks } from "./test-helpers.js";

vi.mock("./auth-iam.js", () => ({
  validateIamToken: async (token: string) => {
    const who = tokens[token];
    return who
      ? {
          ok: true,
          userId: who.userId,
          owner: who.owner,
          orgIds: [who.owner],
          roles: [],
          claims: {},
        }
      : { ok: false, reason: "iam_token_invalid" };
  },
}));
vi.mock("./billing/iam-billing-client.js", async (orig) => ({
  ...(await orig<typeof import("./billing/iam-billing-client.js")>()),
  getTier: vi.fn(),
}));

installGatewayTestHooks({ scope: "suite" });

const tokens: Record<string, { userId: string; owner?: string }> = {
  free: { userId: "free-user", owner: "free-org" },
  paid: { userId: "paid-user", owner: "paid-org" },
  admin: { userId: "z", owner: "admin" },
  noorg: { userId: "orphan" },
};

const IAM = {
  serverUrl: "https://hanzo.id",
  clientId: "hanzo-bot",
  orgName: "hanzo",
  appName: "hanzo-bot",
};

let startGatewayServer: typeof import("./server.js").startGatewayServer;

beforeAll(async () => {
  ({ startGatewayServer } = await import("./server.js"));
});

afterAll(() => {
  vi.unstubAllEnvs();
});

function tier(cents: number, name: string, allowedModels: string[]) {
  vi.mocked(getTier).mockResolvedValue({
    tier: { name, allowedModels },
    balance: { effectiveAvailable: cents },
  });
}

async function chat(port: number, token: string, path = "/v1/chat/completions", model = "bot") {
  const body =
    path === "/v1/responses"
      ? { model, input: "hi" }
      : { model, messages: [{ role: "user", content: "hi" }] };
  return await fetch(`http://127.0.0.1:${port}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

/** The model the last agent run was told to use; undefined means the agent's default. */
function modelRun(): string | undefined {
  const opts = (agentCommand.mock.calls.at(-1) as unknown[] | undefined)?.[0] as
    | { model?: string }
    | undefined;
  return opts?.model;
}

async function inIamGateway(run: (port: number) => Promise<void>) {
  vi.stubEnv("BILLING_URL", "https://pay.example/credit");
  vi.stubEnv("BILLING_GATE_MODE", "");
  const port = await getFreePort();
  const server = await startGatewayServer(port, {
    host: "127.0.0.1",
    auth: { mode: "iam", iam: IAM, token: "operator-token" },
    controlUiEnabled: false,
    openAiChatCompletionsEnabled: true,
    openResponsesEnabled: true,
  });
  try {
    await run(port);
  } finally {
    await server.close({ reason: "billing test done" });
  }
}

describe("paid HTTP paths bill the caller before the platform key is used", () => {
  it("serves a free account at zero balance on the free plan's models", async () => {
    tier(0, "free", ["enso", "enso-auto"]);
    await inIamGateway(async (port) => {
      for (const path of ["/v1/chat/completions", "/v1/responses"]) {
        agentCommand.mockClear();
        agentCommand.mockResolvedValueOnce({ payloads: [{ text: "hello" }] } as never);
        const res = await chat(port, "free", path, "enso-auto");
        expect(res.status).toBe(200);
        await res.text();
        expect(agentCommand).toHaveBeenCalledTimes(1);
        expect(modelRun()).toBe("enso-auto");
      }
    });
  });

  it("runs the plan's own model when none is named and the agent's default is outside it", async () => {
    agentCommand.mockClear();
    agentCommand.mockResolvedValueOnce({ payloads: [{ text: "hello" }] } as never);
    tier(0, "free", ["plan-only-model"]);
    await inIamGateway(async (port) => {
      const res = await chat(port, "free");
      expect(res.status).toBe(200);
      await res.text();
    });
    expect(modelRun()).toBe("plan-only-model");
  });

  it("refuses a model outside the plan with the typed 402, even at zero balance", async () => {
    agentCommand.mockClear();
    tier(0, "free", ["enso", "enso-auto"]);
    await inIamGateway(async (port) => {
      for (const path of ["/v1/chat/completions", "/v1/responses"]) {
        const res = await chat(port, "free", path, "zen6");
        expect(res.status).toBe(402);
        expect(await res.json()).toMatchObject({
          error: {
            type: "billing_error",
            code: "model_not_in_plan",
            model: "zen6",
            billingUrl: "https://pay.example/credit",
          },
        });
      }
    });
    expect(agentCommand).not.toHaveBeenCalled();
  });

  it("refuses a paid plan whose balance is spent, with the typed 402", async () => {
    agentCommand.mockClear();
    tier(0, "pro", ["*"]);
    await inIamGateway(async (port) => {
      const res = await chat(port, "paid");
      expect(res.status).toBe(402);
      expect(await res.json()).toMatchObject({
        error: { code: "payment_required", billingUrl: "https://pay.example/credit" },
      });
    });
    expect(agentCommand).not.toHaveBeenCalled();
  });

  it("lets a paid token through to the agent", async () => {
    agentCommand.mockClear();
    agentCommand.mockResolvedValueOnce({ payloads: [{ text: "hello" }] } as never);
    tier(5000, "pro", ["*"]);
    await inIamGateway(async (port) => {
      const res = await chat(port, "paid");
      expect(res.status).toBe(200);
      await res.text();
    });
    expect(agentCommand).toHaveBeenCalledTimes(1);
    expect(modelRun()).toBeUndefined();
  });

  it("lets a SuperAdmin through without reading a plan", async () => {
    agentCommand.mockClear();
    agentCommand.mockResolvedValueOnce({ payloads: [{ text: "hello" }] } as never);
    vi.mocked(getTier).mockClear();
    await inIamGateway(async (port) => {
      const res = await chat(port, "admin");
      expect(res.status).toBe(200);
      await res.text();
    });
    expect(getTier).not.toHaveBeenCalled();
  });

  it("answers 503, not a paywall, when billing cannot be read", async () => {
    agentCommand.mockClear();
    vi.mocked(getTier).mockRejectedValue(new Error("cloud unreachable"));
    await inIamGateway(async (port) => {
      const res = await chat(port, "paid");
      expect(res.status).toBe(503);
      expect(res.headers.get("retry-after")).toBe("5");
      expect(await res.json()).toMatchObject({ error: { code: "billing_unavailable" } });
    });
    expect(agentCommand).not.toHaveBeenCalled();
  });

  it("refuses an IAM token that names no org, never waves it through", async () => {
    agentCommand.mockClear();
    await inIamGateway(async (port) => {
      const res = await chat(port, "noorg");
      expect(res.status).toBe(402);
      expect(await res.json()).toMatchObject({ error: { code: "payment_required" } });
    });
    expect(agentCommand).not.toHaveBeenCalled();
  });

  it("does not bill the operator's own shared gateway token", async () => {
    agentCommand.mockClear();
    agentCommand.mockResolvedValueOnce({ payloads: [{ text: "hello" }] } as never);
    await inIamGateway(async (port) => {
      const res = await chat(port, "operator-token");
      expect(res.status).toBe(200);
      await res.text();
    });
  });
});
