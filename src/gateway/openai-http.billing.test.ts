import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getBalance, getSubscriptionStatus, getTier } from "./billing/iam-billing-client.js";
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
  getBalance: vi.fn(),
  getSubscriptionStatus: vi.fn(),
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
  vi.mocked(getBalance).mockResolvedValue(cents);
  vi.mocked(getSubscriptionStatus).mockResolvedValue({
    active: false,
    subscription: null,
    plan: null,
  });
  vi.mocked(getTier).mockResolvedValue({ name, allowedModels });
}

async function chat(port: number, token: string, path = "/v1/chat/completions") {
  const body =
    path === "/v1/responses"
      ? { model: "bot", input: "hi" }
      : { model: "bot", messages: [{ role: "user", content: "hi" }] };
  return await fetch(`http://127.0.0.1:${port}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
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
  it("refuses a zero-balance token with the typed 402 and runs no agent", async () => {
    agentCommand.mockClear();
    tier(0, "free", ["zen-free"]);
    await inIamGateway(async (port) => {
      for (const path of ["/v1/chat/completions", "/v1/responses"]) {
        const res = await chat(port, "free", path);
        expect(res.status).toBe(402);
        expect(await res.json()).toMatchObject({
          error: {
            type: "billing_error",
            code: "payment_required",
            billingUrl: "https://pay.example/credit",
          },
        });
      }
    });
    expect(agentCommand).not.toHaveBeenCalled();
  });

  it("refuses a model the plan does not allow, naming it", async () => {
    agentCommand.mockClear();
    tier(500, "free", ["zen-free"]);
    await inIamGateway(async (port) => {
      const res = await chat(port, "free");
      expect(res.status).toBe(402);
      const body = (await res.json()) as { error: { code: string; model: string } };
      expect(body.error.code).toBe("model_not_in_plan");
      expect(body.error.model).toMatch(/\//);
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
  });

  it("lets a SuperAdmin through without reading a plan", async () => {
    agentCommand.mockClear();
    agentCommand.mockResolvedValueOnce({ payloads: [{ text: "hello" }] } as never);
    vi.mocked(getBalance).mockClear();
    await inIamGateway(async (port) => {
      const res = await chat(port, "admin");
      expect(res.status).toBe(200);
      await res.text();
    });
    expect(getBalance).not.toHaveBeenCalled();
  });

  it("answers 503, not a paywall, when billing cannot be read", async () => {
    agentCommand.mockClear();
    vi.mocked(getBalance).mockRejectedValue(new Error("cloud unreachable"));
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
