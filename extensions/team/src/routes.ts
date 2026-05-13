import fs from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import type { BotPluginApi } from "@hanzo/bot/plugin-sdk/team";
import { resolvePreferredBotTmpDir } from "@hanzo/bot/plugin-sdk/team";
import { connectWorkspace, getWorkspace, listWorkspaces } from "./workspace.js";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

type RunEmbeddedPiAgentFn = (params: Record<string, unknown>) => Promise<unknown>;

let cachedRunAgent: RunEmbeddedPiAgentFn | null = null;

async function loadRunEmbeddedPiAgent(): Promise<RunEmbeddedPiAgentFn> {
  if (cachedRunAgent) {
    return cachedRunAgent;
  }
  // Source checkout (tests/dev)
  try {
    const mod = await import("../../../src/agents/pi-embedded-runner.js");
    // oxlint-disable-next-line typescript/no-explicit-any
    if (typeof (mod as any).runEmbeddedPiAgent === "function") {
      // oxlint-disable-next-line typescript/no-explicit-any
      cachedRunAgent = (mod as any).runEmbeddedPiAgent;
      return cachedRunAgent!;
    }
  } catch {
    // ignore
  }
  // Bundled install (built)
  const distExtensionApi = "../../../dist/extensionAPI.js";
  const mod = (await import(distExtensionApi)) as { runEmbeddedPiAgent?: unknown };
  // oxlint-disable-next-line typescript/no-explicit-any
  const fn = (mod as any).runEmbeddedPiAgent;
  if (typeof fn !== "function") {
    throw new Error("Internal error: runEmbeddedPiAgent not available");
  }
  cachedRunAgent = fn as RunEmbeddedPiAgentFn;
  return cachedRunAgent;
}

function collectText(payloads: Array<{ text?: string; isError?: boolean }> | undefined): string {
  const texts = (payloads ?? [])
    .filter((p) => !p.isError && typeof p.text === "string")
    .map((p) => p.text ?? "");
  return texts.join("\n").trim();
}

const MAX_BODY_BYTES = 1024 * 1024; // 1 MB

async function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    req.on("data", (chunk: Buffer) => {
      totalBytes += chunk.length;
      if (totalBytes > MAX_BODY_BYTES) {
        req.destroy();
        reject(new Error("payload too large"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const buf = await readBody(req);
  if (buf.length === 0) {
    return {};
  }
  return JSON.parse(buf.toString("utf-8"));
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

// ---------------------------------------------------------------------------
// LLM call helper — runs a single-turn prompt through the embedded agent
// ---------------------------------------------------------------------------

async function runLlmPrompt(
  api: BotPluginApi,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const runAgent = await loadRunEmbeddedPiAgent();
  let tmpDir: string | null = null;
  try {
    tmpDir = await fs.mkdtemp(path.join(resolvePreferredBotTmpDir(), "team-llm-"));
    const sessionId = `team-${Date.now()}`;
    const sessionFile = path.join(tmpDir, "session.json");

    const result = await runAgent({
      sessionId,
      sessionFile,
      workspaceDir: api.config?.agents?.defaults?.workspace ?? process.cwd(),
      config: api.config,
      prompt: `${systemPrompt}\n\n${userPrompt}`,
      timeoutMs: 30_000,
      runId: `team-${Date.now()}`,
      disableTools: true,
    });

    // oxlint-disable-next-line typescript/no-explicit-any
    const text = collectText((result as any).payloads);
    if (!text) {
      throw new Error("LLM returned empty output");
    }
    return text;
  } finally {
    if (tmpDir) {
      try {
        await fs.rm(tmpDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Route handler factory — called from index.ts to create per-path handlers
// ---------------------------------------------------------------------------

type RouteHandler = (req: IncomingMessage, res: ServerResponse) => Promise<boolean | void>;

export function createHealthHandler(): RouteHandler {
  return async (_req, res) => {
    sendJson(res, 200, { status: "ok" });
    return true;
  };
}

export function createConnectHandler(): RouteHandler {
  return async (req, res) => {
    if (req.method !== "POST") {
      res.statusCode = 405;
      res.setHeader("Allow", "POST");
      res.end("Method Not Allowed");
      return true;
    }
    try {
      const body = (await readJsonBody(req)) as Record<string, unknown>;
      const workspaceId =
        typeof body.workspaceId === "string" ? body.workspaceId.trim() : undefined;
      if (!workspaceId) {
        sendJson(res, 400, { error: "workspaceId is required" });
        return true;
      }
      const connection = connectWorkspace(workspaceId, body.metadata as Record<string, unknown>);
      sendJson(res, 200, { ok: true, connection });
      return true;
    } catch (err) {
      sendJson(res, 400, { error: String(err) });
      return true;
    }
  };
}

export function createEventsHandler(): RouteHandler {
  return async (req, res) => {
    if (req.method !== "POST") {
      res.statusCode = 405;
      res.setHeader("Allow", "POST");
      res.end("Method Not Allowed");
      return true;
    }
    try {
      const body = (await readJsonBody(req)) as Record<string, unknown>;
      // Acknowledge the event. In future this can dispatch to the agent system.
      const eventType = typeof body.type === "string" ? body.type : "unknown";
      sendJson(res, 200, { ok: true, eventType, received: true });
      return true;
    } catch (err) {
      sendJson(res, 400, { error: String(err) });
      return true;
    }
  };
}

export function createTranslateHandler(api: BotPluginApi): RouteHandler {
  return async (req, res) => {
    if (req.method !== "POST") {
      res.statusCode = 405;
      res.setHeader("Allow", "POST");
      res.end("Method Not Allowed");
      return true;
    }
    try {
      const body = (await readJsonBody(req)) as Record<string, unknown>;
      const text = typeof body.text === "string" ? body.text : "";
      const lang = typeof body.lang === "string" ? body.lang : "en";

      if (!text.trim()) {
        sendJson(res, 400, { error: "text is required" });
        return true;
      }

      const systemPrompt =
        "You are a translator. Translate the given text to the target language. " +
        "Return only the translated text, nothing else.";
      const userPrompt = `Translate the following text to ${lang}:\n\n${text}`;

      const translated = await runLlmPrompt(api, systemPrompt, userPrompt);
      sendJson(res, 200, { ok: true, translated, lang });
      return true;
    } catch (err) {
      sendJson(res, 500, { error: String(err) });
      return true;
    }
  };
}

export function createSummarizeHandler(api: BotPluginApi): RouteHandler {
  return async (req, res) => {
    if (req.method !== "POST") {
      res.statusCode = 405;
      res.setHeader("Allow", "POST");
      res.end("Method Not Allowed");
      return true;
    }
    try {
      const body = (await readJsonBody(req)) as Record<string, unknown>;
      const messages = Array.isArray(body.messages) ? body.messages : [];

      if (messages.length === 0) {
        sendJson(res, 400, { error: "messages array is required and must not be empty" });
        return true;
      }

      const formatted = messages
        .map((m: unknown) => {
          if (typeof m === "string") return m;
          if (m && typeof m === "object" && "text" in m) {
            const msg = m as { from?: string; text?: string };
            return msg.from ? `${msg.from}: ${msg.text}` : String(msg.text);
          }
          return JSON.stringify(m);
        })
        .join("\n");

      const systemPrompt =
        "You are a summarizer. Produce a concise summary of the conversation below. " +
        "Return only the summary text.";
      const userPrompt = `Summarize this conversation:\n\n${formatted}`;

      const summary = await runLlmPrompt(api, systemPrompt, userPrompt);
      sendJson(res, 200, { ok: true, summary });
      return true;
    } catch (err) {
      sendJson(res, 500, { error: String(err) });
      return true;
    }
  };
}

// ---------------------------------------------------------------------------
// OpenAI-compatible proxy: POST /api/channels/team/v1/chat/completions
// ---------------------------------------------------------------------------

export function createChatCompletionsProxyHandler(api: BotPluginApi): RouteHandler {
  return async (req, res) => {
    if (req.method !== "POST") {
      res.statusCode = 405;
      res.setHeader("Allow", "POST");
      res.end("Method Not Allowed");
      return true;
    }
    try {
      const body = (await readJsonBody(req)) as Record<string, unknown>;
      const messagesRaw = Array.isArray(body.messages) ? body.messages : [];
      const model = typeof body.model === "string" ? body.model : "claude-sonnet-4-6";

      // Flatten messages into a single prompt for the embedded agent
      const userMessages = messagesRaw
        .filter((m: any) => typeof m === "object" && m !== null)
        .map((m: any) => {
          const role = typeof m.role === "string" ? m.role : "user";
          const content = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
          return `[${role}]: ${content}`;
        })
        .join("\n");

      if (!userMessages.trim()) {
        sendJson(res, 400, {
          error: {
            message: "messages array must contain at least one message",
            type: "invalid_request_error",
          },
        });
        return true;
      }

      const result = await runLlmPrompt(api, "You are a helpful assistant.", userMessages);

      // Return OpenAI-compatible response
      const responseId = `chatcmpl-team-${Date.now()}`;
      sendJson(res, 200, {
        id: responseId,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: result },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      });
      return true;
    } catch (err) {
      sendJson(res, 500, {
        error: { message: String(err), type: "server_error" },
      });
      return true;
    }
  };
}

// ---------------------------------------------------------------------------
// Anthropic-compatible proxy: POST /api/channels/team/v1/messages
// ---------------------------------------------------------------------------

export function createMessagesProxyHandler(api: BotPluginApi): RouteHandler {
  return async (req, res) => {
    if (req.method !== "POST") {
      res.statusCode = 405;
      res.setHeader("Allow", "POST");
      res.end("Method Not Allowed");
      return true;
    }
    try {
      const body = (await readJsonBody(req)) as Record<string, unknown>;
      const messagesRaw = Array.isArray(body.messages) ? body.messages : [];
      const model = typeof body.model === "string" ? body.model : "claude-sonnet-4-6";
      const systemRaw =
        typeof body.system === "string" ? body.system : "You are a helpful assistant.";

      const userMessages = messagesRaw
        .filter((m: any) => typeof m === "object" && m !== null)
        .map((m: any) => {
          const role = typeof m.role === "string" ? m.role : "user";
          const content = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
          return `[${role}]: ${content}`;
        })
        .join("\n");

      if (!userMessages.trim()) {
        sendJson(res, 400, {
          type: "error",
          error: { type: "invalid_request_error", message: "messages must not be empty" },
        });
        return true;
      }

      const result = await runLlmPrompt(api, systemRaw, userMessages);

      const responseId = `msg-team-${Date.now()}`;
      sendJson(res, 200, {
        id: responseId,
        type: "message",
        role: "assistant",
        content: [{ type: "text", text: result }],
        model,
        stop_reason: "end_turn",
        usage: { input_tokens: 0, output_tokens: 0 },
      });
      return true;
    } catch (err) {
      sendJson(res, 500, {
        type: "error",
        error: { type: "server_error", message: String(err) },
      });
      return true;
    }
  };
}
