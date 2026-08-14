import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  handleLlmProxyHttpRequest,
  isPerTenantUpstreamCredential,
  type LlmProxyHttpOptions,
} from "./llm-proxy-http.js";

// Minimal auth that always succeeds for unit tests.
const ALLOW_ALL_AUTH: LlmProxyHttpOptions = {
  auth: { mode: "none" } as never,
};

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("could not get port"));
        return;
      }
      const port = addr.port;
      server.close(() => resolve(port));
    });
  });
}

/** Create a minimal upstream mock server that records requests and responds. */
function createUpstreamMock(handler: (req: IncomingMessage, res: ServerResponse) => void) {
  const server = createServer(handler);
  return {
    server,
    start: () =>
      new Promise<number>((resolve) => {
        server.listen(0, "127.0.0.1", () => {
          const addr = server.address();
          resolve(typeof addr === "object" && addr ? addr.port : 0);
        });
      }),
    stop: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

describe("LLM Proxy HTTP handler", () => {
  it("returns false for non-proxy paths", async () => {
    const req = { url: "/health", method: "GET", headers: {} } as IncomingMessage;
    const res = {} as ServerResponse;
    const result = await handleLlmProxyHttpRequest(req, res, ALLOW_ALL_AUTH);
    expect(result).toBe(false);
  });

  it("returns false for /v1/chat/completions (handled by openai-http)", async () => {
    const req = { url: "/v1/chat/completions", method: "POST", headers: {} } as IncomingMessage;
    const res = {} as ServerResponse;
    const result = await handleLlmProxyHttpRequest(req, res, ALLOW_ALL_AUTH);
    expect(result).toBe(false);
  });

  it("returns false for /v1/responses (handled by openresponses-http)", async () => {
    const req = { url: "/v1/responses", method: "POST", headers: {} } as IncomingMessage;
    const res = {} as ServerResponse;
    const result = await handleLlmProxyHttpRequest(req, res, ALLOW_ALL_AUTH);
    expect(result).toBe(false);
  });

  function createMockRes(): ServerResponse & { _statusCode: number } {
    const mock = {
      _statusCode: 0,
      _headers: new Map<string, string>(),
      _body: [] as string[],
      get statusCode() {
        return mock._statusCode;
      },
      set statusCode(v: number) {
        mock._statusCode = v;
      },
      setHeader: (k: string, v: string) => mock._headers.set(k, v),
      end: (body?: string) => {
        if (body) {
          mock._body.push(body);
        }
      },
    };
    return mock as unknown as ServerResponse & { _statusCode: number };
  }

  for (const path of ["/v1/completions", "/v1/embeddings", "/v1/messages"]) {
    it(`rejects GET on POST-only path ${path}`, async () => {
      const req = { url: path, method: "GET", headers: {} } as IncomingMessage;
      const res = createMockRes();
      const result = await handleLlmProxyHttpRequest(req, res, ALLOW_ALL_AUTH);
      expect(result).toBe(true);
      expect(res.statusCode).toBe(405);
    });
  }

  it("rejects POST on GET-only path /v1/models", async () => {
    const req = { url: "/v1/models", method: "POST", headers: {} } as IncomingMessage;
    const res = createMockRes();
    const result = await handleLlmProxyHttpRequest(req, res, ALLOW_ALL_AUTH);
    expect(result).toBe(true);
    expect(res.statusCode).toBe(405);
  });
});

describe("LLM Proxy HTTP handler (upstream integration)", () => {
  let upstreamPort: number;
  let upstreamMock: ReturnType<typeof createUpstreamMock>;
  const originalEnv: Record<string, string | undefined> = {};

  beforeEach(async () => {
    originalEnv.OPENAI_BASE_URL = process.env.OPENAI_BASE_URL;
    originalEnv.OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    originalEnv.LLM_BASE_URL = process.env.LLM_BASE_URL;
    originalEnv.LLM_API_KEY = process.env.LLM_API_KEY;
  });

  afterEach(async () => {
    process.env.OPENAI_BASE_URL = originalEnv.OPENAI_BASE_URL;
    process.env.OPENAI_API_KEY = originalEnv.OPENAI_API_KEY;
    process.env.LLM_BASE_URL = originalEnv.LLM_BASE_URL;
    process.env.LLM_API_KEY = originalEnv.LLM_API_KEY;
    if (upstreamMock) {
      await upstreamMock.stop();
    }
  });

  it("proxies GET /v1/models to upstream", async () => {
    const mockModels = {
      object: "list",
      data: [{ id: "claude-opus-4-6", object: "model", created: 1700000000, owned_by: "hanzo" }],
    };

    let receivedHeaders: Record<string, string | string[] | undefined> = {};
    upstreamMock = createUpstreamMock((req, res) => {
      receivedHeaders = req.headers;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(mockModels));
    });
    upstreamPort = await upstreamMock.start();
    process.env.OPENAI_BASE_URL = `http://127.0.0.1:${upstreamPort}`;
    process.env.OPENAI_API_KEY = "test-key-123";

    // Create a real HTTP server that uses our handler
    const gatewayPort = await getFreePort();
    const gateway = createServer(async (req, res) => {
      const handled = await handleLlmProxyHttpRequest(req, res, ALLOW_ALL_AUTH);
      if (!handled) {
        res.writeHead(404);
        res.end("Not Found");
      }
    });

    await new Promise<void>((resolve) => gateway.listen(gatewayPort, "127.0.0.1", resolve));

    try {
      const response = await fetch(`http://127.0.0.1:${gatewayPort}/v1/models`, {
        headers: { authorization: "Bearer test-key-123" },
      });
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toEqual(mockModels);
      // Verify upstream received Bearer auth
      expect(receivedHeaders.authorization).toBe("Bearer test-key-123");
    } finally {
      await new Promise<void>((resolve) => gateway.close(() => resolve()));
    }
  });

  it("proxies POST /v1/messages with Anthropic headers", async () => {
    const mockResponse = {
      id: "msg_123",
      type: "message",
      role: "assistant",
      content: [{ type: "text", text: "Hello" }],
    };

    let receivedHeaders: Record<string, string | string[] | undefined> = {};
    let receivedBody = "";
    upstreamMock = createUpstreamMock((req, res) => {
      receivedHeaders = req.headers;
      const chunks: Buffer[] = [];
      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", () => {
        receivedBody = Buffer.concat(chunks).toString();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(mockResponse));
      });
    });
    upstreamPort = await upstreamMock.start();
    process.env.OPENAI_BASE_URL = `http://127.0.0.1:${upstreamPort}`;
    process.env.OPENAI_API_KEY = "test-anthropic-key";

    const gatewayPort = await getFreePort();
    const gateway = createServer(async (req, res) => {
      const handled = await handleLlmProxyHttpRequest(req, res, ALLOW_ALL_AUTH);
      if (!handled) {
        res.writeHead(404);
        res.end("Not Found");
      }
    });

    await new Promise<void>((resolve) => gateway.listen(gatewayPort, "127.0.0.1", resolve));

    try {
      const requestBody = {
        model: "claude-opus-4-6",
        max_tokens: 1024,
        messages: [{ role: "user", content: "Hello" }],
      };

      const response = await fetch(`http://127.0.0.1:${gatewayPort}/v1/messages`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer test-anthropic-key",
        },
        body: JSON.stringify(requestBody),
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toEqual(mockResponse);

      // Verify upstream got Anthropic-style headers
      expect(receivedHeaders["x-api-key"]).toBe("test-anthropic-key");
      expect(receivedHeaders["anthropic-version"]).toBe("2023-06-01");
      // No Authorization header for Anthropic
      expect(receivedHeaders.authorization).toBeUndefined();

      // Verify request body was forwarded
      const parsed = JSON.parse(receivedBody);
      expect(parsed.model).toBe("claude-opus-4-6");
      expect(parsed.messages).toEqual([{ role: "user", content: "Hello" }]);
    } finally {
      await new Promise<void>((resolve) => gateway.close(() => resolve()));
    }
  });

  it("forwards the caller's OWN sk- credential upstream, NOT the shared env key (multi-tenant billing)", async () => {
    // The bot authenticated with its own sk- Cloud API key; the gateway also has
    // a shared OPENAI_API_KEY. The caller's per-tenant key MUST win so the
    // upstream meter bills the bot's own org — not the shared, single-org key.
    let receivedAuth: string | string[] | undefined;
    upstreamMock = createUpstreamMock((req, res) => {
      receivedAuth = req.headers.authorization;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ object: "list", data: [] }));
    });
    upstreamPort = await upstreamMock.start();
    process.env.OPENAI_BASE_URL = `http://127.0.0.1:${upstreamPort}`;
    process.env.OPENAI_API_KEY = "sk-shared-single-org-key";

    const gatewayPort = await getFreePort();
    const gateway = createServer(async (req, res) => {
      const handled = await handleLlmProxyHttpRequest(req, res, ALLOW_ALL_AUTH);
      if (!handled) {
        res.writeHead(404);
        res.end("Not Found");
      }
    });
    await new Promise<void>((resolve) => gateway.listen(gatewayPort, "127.0.0.1", resolve));

    try {
      await fetch(`http://127.0.0.1:${gatewayPort}/v1/models`, {
        headers: { authorization: "Bearer sk-live-b07b07b07b07b07b07b07b07b07b07b0" },
      });
      // Per-tenant key forwarded — billed to the bot's org, not the shared key.
      expect(receivedAuth).toBe("Bearer sk-live-b07b07b07b07b07b07b07b07b07b07b0");
    } finally {
      await new Promise<void>((resolve) => gateway.close(() => resolve()));
    }
  });

  it("falls back to the shared env key when the caller used the shared gateway token", async () => {
    // An opaque shared gateway token is NOT an upstream credential and must
    // never be forwarded; the shared env key is used instead.
    let receivedAuth: string | string[] | undefined;
    upstreamMock = createUpstreamMock((req, res) => {
      receivedAuth = req.headers.authorization;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ object: "list", data: [] }));
    });
    upstreamPort = await upstreamMock.start();
    process.env.OPENAI_BASE_URL = `http://127.0.0.1:${upstreamPort}`;
    process.env.OPENAI_API_KEY = "sk-shared-fallback-key";

    const gatewayPort = await getFreePort();
    const gateway = createServer(async (req, res) => {
      const handled = await handleLlmProxyHttpRequest(req, res, ALLOW_ALL_AUTH);
      if (!handled) {
        res.writeHead(404);
        res.end("Not Found");
      }
    });
    await new Promise<void>((resolve) => gateway.listen(gatewayPort, "127.0.0.1", resolve));

    try {
      await fetch(`http://127.0.0.1:${gatewayPort}/v1/models`, {
        headers: { authorization: "Bearer opaque-shared-gateway-token" },
      });
      expect(receivedAuth).toBe("Bearer sk-shared-fallback-key");
    } finally {
      await new Promise<void>((resolve) => gateway.close(() => resolve()));
    }
  });

  it("returns 502 when upstream is unreachable", async () => {
    // Point to a port that's not listening
    process.env.OPENAI_BASE_URL = "http://127.0.0.1:1";
    process.env.OPENAI_API_KEY = "test-key";

    const gatewayPort = await getFreePort();
    const gateway = createServer(async (req, res) => {
      const handled = await handleLlmProxyHttpRequest(req, res, ALLOW_ALL_AUTH);
      if (!handled) {
        res.writeHead(404);
        res.end("Not Found");
      }
    });

    await new Promise<void>((resolve) => gateway.listen(gatewayPort, "127.0.0.1", resolve));

    try {
      const response = await fetch(`http://127.0.0.1:${gatewayPort}/v1/models`);
      expect(response.status).toBe(502);
      const body = (await response.json()) as { error?: { type?: string } };
      expect(body.error?.type).toBe("upstream_error");
    } finally {
      await new Promise<void>((resolve) => gateway.close(() => resolve()));
    }
  });
});

describe("isPerTenantUpstreamCredential", () => {
  // IAM mints <prefix>-<live|test>-<hex>, so the environment segment is what
  // makes a key Hanzo's rather than some other vendor's sk-.
  it("treats a Hanzo sk-live- Cloud API key as a per-tenant credential", () => {
    expect(isPerTenantUpstreamCredential("sk-live-0123456789abcdef0123456789abcdef")).toBe(true);
    expect(isPerTenantUpstreamCredential("sk-test-0123456789abcdef0123456789abcdef")).toBe(true);
  });

  // The retired prefix. Matching it meant a caller holding a CURRENT key was not
  // recognised, fell through to the shared gateway key, and had its usage metered
  // against that key's org — multi-tenancy off, silently.
  it("does NOT treat the retired hk- prefix as a per-tenant credential", () => {
    expect(isPerTenantUpstreamCredential("hk-live-abc123")).toBe(false);
  });

  // sk- alone is OpenAI's and Anthropic's shape too, and forwarding a shared
  // provider key as if it were the caller's own is the mis-billing this guards.
  it("does NOT treat another vendor's sk- key as a per-tenant credential", () => {
    expect(isPerTenantUpstreamCredential("sk-proj-abc123")).toBe(false);
    expect(isPerTenantUpstreamCredential("sk-ant-api03-abc123")).toBe(false);
  });

  // Publishable by construction: it never becomes a principal upstream, so
  // forwarding one buys a 401 where the shared key would have completed the call.
  it("does NOT treat a publishable pk- key as a per-tenant credential", () => {
    expect(isPerTenantUpstreamCredential("pk-live-0123456789abcdef0123456789abcdef")).toBe(false);
  });

  it("treats an IAM JWT (three JWS segments) as a per-tenant credential", () => {
    expect(isPerTenantUpstreamCredential("eyJhbG.eyJzdWIi.sig")).toBe(true);
  });

  it("treats an opaque shared gateway token as NOT a per-tenant credential", () => {
    expect(isPerTenantUpstreamCredential("opaque-shared-gateway-token")).toBe(false);
    expect(isPerTenantUpstreamCredential("a1b2c3d4e5f6")).toBe(false);
  });

  it("treats a shared sk- provider env key as NOT a per-tenant credential", () => {
    expect(isPerTenantUpstreamCredential("sk-shared-single-org-key")).toBe(false);
  });
});
