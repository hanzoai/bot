import { describe, it, expect, vi, beforeEach } from "vitest";
import type { IncomingMessage, ServerResponse } from "node:http";
import { EventEmitter } from "node:events";
import {
  createHealthHandler,
  createConnectHandler,
  createEventsHandler,
  createTranslateHandler,
  createSummarizeHandler,
  createChatCompletionsProxyHandler,
  createMessagesProxyHandler,
} from "./routes.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createMockReq(
  method: string,
  body: unknown = {},
): IncomingMessage {
  const emitter = new EventEmitter() as IncomingMessage;
  emitter.method = method;
  emitter.headers = {};
  // Simulate body delivery on next tick
  process.nextTick(() => {
    const buf = Buffer.from(JSON.stringify(body), "utf-8");
    emitter.emit("data", buf);
    emitter.emit("end");
  });
  return emitter;
}

function createMockRes(): ServerResponse & {
  _status: number;
  _body: string;
  _headers: Record<string, string>;
} {
  const res = {
    statusCode: 200,
    _status: 200,
    _body: "",
    _headers: {} as Record<string, string>,
    headersSent: false,
    setHeader(key: string, value: string) {
      res._headers[key.toLowerCase()] = value;
    },
    end(data?: string) {
      if (data) {
        res._body = data;
      }
      res._status = res.statusCode;
    },
    write(_data: string) {},
    flushHeaders() {},
  } as unknown as ServerResponse & {
    _status: number;
    _body: string;
    _headers: Record<string, string>;
  };
  return res;
}

function parseBody(res: { _body: string }): unknown {
  return JSON.parse(res._body);
}

function createMockApi(): any {
  return {
    config: {
      agents: {
        defaults: {
          workspace: "/tmp/test-workspace",
        },
      },
    },
    pluginConfig: {},
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("team extension routes", () => {
  describe("GET /health", () => {
    it("returns status ok", async () => {
      const handler = createHealthHandler();
      const req = createMockReq("GET");
      const res = createMockRes();
      const handled = await handler(req, res);
      expect(handled).toBe(true);
      expect(res._status).toBe(200);
      expect(parseBody(res)).toEqual({ status: "ok" });
    });
  });

  describe("POST /connect", () => {
    it("accepts a workspace connection", async () => {
      const handler = createConnectHandler();
      const req = createMockReq("POST", { workspaceId: "ws-123" });
      const res = createMockRes();
      const handled = await handler(req, res);
      expect(handled).toBe(true);
      expect(res._status).toBe(200);
      const body = parseBody(res) as any;
      expect(body.ok).toBe(true);
      expect(body.connection.workspaceId).toBe("ws-123");
    });

    it("rejects missing workspaceId", async () => {
      const handler = createConnectHandler();
      const req = createMockReq("POST", {});
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(400);
      const body = parseBody(res) as any;
      expect(body.error).toContain("workspaceId");
    });

    it("rejects non-POST", async () => {
      const handler = createConnectHandler();
      const req = createMockReq("GET");
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(405);
    });
  });

  describe("POST /events", () => {
    it("acknowledges events", async () => {
      const handler = createEventsHandler();
      const req = createMockReq("POST", { type: "message.new", channelId: "ch-1" });
      const res = createMockRes();
      const handled = await handler(req, res);
      expect(handled).toBe(true);
      expect(res._status).toBe(200);
      const body = parseBody(res) as any;
      expect(body.ok).toBe(true);
      expect(body.eventType).toBe("message.new");
      expect(body.received).toBe(true);
    });

    it("rejects non-POST", async () => {
      const handler = createEventsHandler();
      const req = createMockReq("GET");
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(405);
    });
  });

  describe("POST /translate", () => {
    it("rejects empty text", async () => {
      const api = createMockApi();
      const handler = createTranslateHandler(api);
      const req = createMockReq("POST", { text: "", lang: "es" });
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(400);
      const body = parseBody(res) as any;
      expect(body.error).toContain("text");
    });

    it("rejects non-POST", async () => {
      const api = createMockApi();
      const handler = createTranslateHandler(api);
      const req = createMockReq("GET");
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(405);
    });
  });

  describe("POST /summarize", () => {
    it("rejects empty messages", async () => {
      const api = createMockApi();
      const handler = createSummarizeHandler(api);
      const req = createMockReq("POST", { messages: [] });
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(400);
      const body = parseBody(res) as any;
      expect(body.error).toContain("messages");
    });

    it("rejects non-POST", async () => {
      const api = createMockApi();
      const handler = createSummarizeHandler(api);
      const req = createMockReq("GET");
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(405);
    });
  });

  describe("POST /v1/chat/completions", () => {
    it("rejects empty messages", async () => {
      const api = createMockApi();
      const handler = createChatCompletionsProxyHandler(api);
      const req = createMockReq("POST", { messages: [] });
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(400);
      const body = parseBody(res) as any;
      expect(body.error.type).toBe("invalid_request_error");
    });

    it("rejects non-POST", async () => {
      const api = createMockApi();
      const handler = createChatCompletionsProxyHandler(api);
      const req = createMockReq("GET");
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(405);
    });
  });

  describe("POST /v1/messages", () => {
    it("rejects empty messages", async () => {
      const api = createMockApi();
      const handler = createMessagesProxyHandler(api);
      const req = createMockReq("POST", { messages: [] });
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(400);
      const body = parseBody(res) as any;
      expect(body.error.type).toBe("invalid_request_error");
    });

    it("rejects non-POST", async () => {
      const api = createMockApi();
      const handler = createMessagesProxyHandler(api);
      const req = createMockReq("GET");
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(405);
    });
  });
});
