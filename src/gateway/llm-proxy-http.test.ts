import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { handleLlmProxyHttpRequest, type LlmProxyHttpOptions } from "./llm-proxy-http.js";

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
