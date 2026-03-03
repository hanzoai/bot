import type { BotConfig, PluginRuntime } from "bot/plugin-sdk";
import type { AddressInfo } from "node:net";
import { createServer } from "node:http";
import { describe, expect, it, vi } from "vitest";
import type { ResolvedZaloAccount } from "./types.js";
import { handleZaloWebhookRequest, registerZaloWebhookTarget } from "./monitor.js";

async function withServer(
  handler: Parameters<typeof createServer>[0],
  fn: (baseUrl: string) => Promise<void>,
) {
  const server = createServer(handler);
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address() as AddressInfo | null;
  if (!address) {
    throw new Error("missing server address");
  }
  try {
    await fn(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

describe("handleZaloWebhookRequest", () => {
  afterEach(() => {
    clearZaloWebhookSecurityStateForTest();
    setActivePluginRegistry(createEmptyPluginRegistry());
  });

  it("registers and unregisters plugin HTTP route at path boundaries", () => {
    const registry = createEmptyPluginRegistry();
    setActivePluginRegistry(registry);
    const unregisterA = registerTarget({ path: "/hook" });
    const unregisterB = registerTarget({ path: "/hook" });

    expect(registry.httpRoutes).toHaveLength(1);
    expect(registry.httpRoutes[0]).toEqual(
      expect.objectContaining({
        pluginId: "zalo",
        path: "/hook",
        source: "zalo-webhook",
      }),
    );

    unregisterA();
    expect(registry.httpRoutes).toHaveLength(1);
    unregisterB();
    expect(registry.httpRoutes).toHaveLength(0);
  });

  it("returns 400 for non-object payloads", async () => {
    const core = {} as PluginRuntime;
    const account: ResolvedZaloAccount = {
      accountId: "default",
      enabled: true,
      token: "tok",
      tokenSource: "config",
      config: {},
    };
    const unregister = registerZaloWebhookTarget({
      token: "tok",
      account,
      config: {} as BotConfig,
      runtime: {},
      core,
      secret: "secret",
      path: "/hook",
      mediaMaxMb: 5,
    });

    try {
      await withServer(
        async (req, res) => {
          const handled = await handleZaloWebhookRequest(req, res);
          if (!handled) {
            res.statusCode = 404;
            res.end("not found");
          }
        },
        async (baseUrl) => {
          const response = await fetch(`${baseUrl}/hook`, {
            method: "POST",
            headers: {
              "x-bot-api-secret-token": "secret",
            },
            body: "null",
          });

          expect(response.status).toBe(400);
        },
      );
    } finally {
      unregister();
    }
  });

  it("rejects ambiguous routing when multiple targets match the same secret", async () => {
    const core = {} as PluginRuntime;
    const account: ResolvedZaloAccount = {
      accountId: "default",
      enabled: true,
      token: "tok",
      tokenSource: "config",
      config: {},
    };
    const sinkA = vi.fn();
    const sinkB = vi.fn();
    const unregisterA = registerZaloWebhookTarget({
      token: "tok",
      account,
      config: {} as BotConfig,
      runtime: {},
      core,
      secret: "secret",
      path: "/hook",
      mediaMaxMb: 5,
      statusSink: sinkA,
    });
    const unregisterB = registerZaloWebhookTarget({
      token: "tok",
      account,
      config: {} as BotConfig,
      runtime: {},
      core,
      secret: "secret",
      path: "/hook",
      mediaMaxMb: 5,
      statusSink: sinkB,
    });

    try {
      await withServer(
        async (req, res) => {
          const handled = await handleZaloWebhookRequest(req, res);
          if (!handled) {
            res.statusCode = 404;
            res.end("not found");
          }
        },
        async (baseUrl) => {
          const response = await fetch(`${baseUrl}/hook`, {
            method: "POST",
            headers: {
              "x-bot-api-secret-token": "secret",
              "content-type": "application/json",
            },
            body: "{}",
          });

          expect(response.status).toBe(401);
          expect(sinkA).not.toHaveBeenCalled();
          expect(sinkB).not.toHaveBeenCalled();
        },
      );
    } finally {
      unregisterA();
      unregisterB();
    }
  });
  it("does not grow status counters when query strings churn on unauthorized requests", async () => {
    const unregister = registerTarget({ path: "/hook-query-status" });

    try {
      await withServer(webhookRequestHandler, async (baseUrl) => {
        for (let i = 0; i < 200; i += 1) {
          const response = await fetch(`${baseUrl}/hook-query-status?nonce=${i}`, {
            method: "POST",
            headers: {
              "x-bot-api-secret-token": "invalid-token",
              "content-type": "application/json",
            },
            body: "{}",
          });
          expect(response.status).toBe(401);
        }

        expect(getZaloWebhookStatusCounterSizeForTest()).toBe(1);
      });
    } finally {
      unregister();
    }
  });

  it("rate limits authenticated requests even when query strings churn", async () => {
    const unregister = registerTarget({ path: "/hook-query-rate" });

    try {
      await withServer(webhookRequestHandler, async (baseUrl) => {
        let saw429 = false;
        for (let i = 0; i < 130; i += 1) {
          const response = await fetch(`${baseUrl}/hook-query-rate?nonce=${i}`, {
            method: "POST",
            headers: {
              "x-bot-api-secret-token": "secret",
              "content-type": "application/json",
            },
            body: "{}",
          });
          if (response.status === 429) {
            saw429 = true;
            break;
          }
        }

        expect(saw429).toBe(true);
        expect(getZaloWebhookRateLimitStateSizeForTest()).toBe(1);
      });
    } finally {
      unregister();
    }
  });

  it("scopes DM pairing store reads and writes to accountId", async () => {
    const { core, readAllowFromStore, upsertPairingRequest } = createPairingAuthCore({
      pairingCreated: false,
    });
    const account: ResolvedZaloAccount = {
      ...DEFAULT_ACCOUNT,
      accountId: "work",
      config: {
        dmPolicy: "pairing",
        allowFrom: [],
      },
    };
    const unregister = registerTarget({
      path: "/hook-account-scope",
      account,
      core,
    });

    const payload = {
      event_name: "message.text.received",
      message: {
        from: { id: "123", name: "Attacker" },
        chat: { id: "dm-work", chat_type: "PRIVATE" },
        message_id: "msg-work-1",
        date: Math.floor(Date.now() / 1000),
        text: "hello",
      },
    };

    try {
      await withServer(webhookRequestHandler, async (baseUrl) => {
        const response = await fetch(`${baseUrl}/hook-account-scope`, {
          method: "POST",
          headers: {
            "x-bot-api-secret-token": "secret",
            "content-type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        expect(response.status).toBe(200);
      });
    } finally {
      unregister();
    }

    expect(readAllowFromStore).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "zalo",
        accountId: "work",
      }),
    );
    expect(upsertPairingRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "zalo",
        id: "123",
        accountId: "work",
      }),
    );
  });
});
