import { createHmac } from "node:crypto";
import { once } from "node:events";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { HTTPReceiver } from "@slack/bolt";
import { afterEach, describe, expect, it, vi } from "vitest";
import { installRequestBodyLimitGuard } from "../../infra/http-body.js";
import { registerSlackInteractionEvents } from "../monitor/events/interactions.js";
import { buildSlackDebounceKey } from "../monitor/message-handler.js";
import { resolveSlackMessageContent } from "../monitor/message-handler/prepare-content.js";
import { escapeSlackMrkdwn } from "../monitor/mrkdwn.js";
import type { SlackMessageEvent } from "../types.js";

const enqueueSystemEventMock = vi.hoisted(() => vi.fn());

vi.mock("../../infra/system-events.js", () => ({
  enqueueSystemEvent: (...args: unknown[]) => enqueueSystemEventMock(...args),
}));

function signSlackRequest(secret: string, timestamp: string, rawBody: string): string {
  const digest = createHmac("sha256", secret).update(`v0:${timestamp}:${rawBody}`).digest("hex");
  return `v0=${digest}`;
}

async function startGuardedSlackReceiverServer(params: {
  signingSecret: string;
  maxBytes?: number;
}) {
  const receiver = new HTTPReceiver({
    signingSecret: params.signingSecret,
    endpoints: "/slack/events",
  });
  const listenerSpy = vi.fn(async (req: IncomingMessage, res: ServerResponse) => {
    await Promise.resolve(receiver.requestListener(req, res));
  });
  const server = createServer((req, res) => {
    const guard = installRequestBodyLimitGuard(req, res, {
      maxBytes: params.maxBytes ?? 1024 * 1024,
      timeoutMs: 5000,
      responseFormat: "text",
    });
    if (guard.isTripped()) {
      return;
    }
    void listenerSpy(req, res).finally(() => {
      guard.dispose();
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const addr = server.address();
  if (!addr || typeof addr === "string") {
    throw new Error("Expected IPv4 server address");
  }
  return {
    baseUrl: `http://127.0.0.1:${addr.port}`,
    listenerSpy,
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

describe("Slack HTTP webhook signature verification & body guards", () => {
  const closers: Array<() => Promise<void>> = [];

  afterEach(async () => {
    for (const close of closers.splice(0)) {
      await close();
    }
  });

  it("accepts valid HMAC-SHA256 signed url_verification requests", async () => {
    const signingSecret = "test-slack-signing-secret";
    const srv = await startGuardedSlackReceiverServer({ signingSecret });
    closers.push(srv.close);

    const payload = JSON.stringify({ type: "url_verification", challenge: "hanzo-ok" });
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = signSlackRequest(signingSecret, ts, payload);

    const res = await fetch(`${srv.baseUrl}/slack/events`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-slack-request-timestamp": ts,
        "x-slack-signature": sig,
      },
      body: payload,
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ challenge: "hanzo-ok" });
  });

  it("rejects invalid signature, stale timestamp replay, and missing headers", async () => {
    const signingSecret = "test-slack-signing-secret";
    const srv = await startGuardedSlackReceiverServer({ signingSecret });
    closers.push(srv.close);

    const payload = JSON.stringify({ type: "url_verification", challenge: "blocked" });
    const nowTs = String(Math.floor(Date.now() / 1000));
    const staleTs = String(Math.floor(Date.now() / 1000) - 600);

    const badSigRes = await fetch(`${srv.baseUrl}/slack/events`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-slack-request-timestamp": nowTs,
        "x-slack-signature": "v0=0000deadbeef",
      },
      body: payload,
    });
    expect(badSigRes.status).toBe(401);

    const staleRes = await fetch(`${srv.baseUrl}/slack/events`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-slack-request-timestamp": staleTs,
        "x-slack-signature": signSlackRequest(signingSecret, staleTs, payload),
      },
      body: payload,
    });
    expect(staleRes.status).toBe(401);

    const missingHeaderRes = await fetch(`${srv.baseUrl}/slack/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: payload,
    });
    expect(missingHeaderRes.status).toBe(401);
  });

  it("trips request body guard with 413 on oversized webhook payloads", async () => {
    const srv = await startGuardedSlackReceiverServer({
      signingSecret: "test-slack-signing-secret",
      maxBytes: 64,
    });
    closers.push(srv.close);

    const oversized = JSON.stringify({ type: "event_callback", text: "x".repeat(256) });
    const res = await fetch(`${srv.baseUrl}/slack/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: oversized,
    });

    expect(res.status).toBe(413);
  });
});

describe("Slack inbound message normalization, debounce scoping, and approval actions", () => {
  it("isolates top-level channel debounce keys per ts while batching DMs and threads", () => {
    const msg1 = { type: "message", channel: "C10", user: "U1", ts: "100.1" } as SlackMessageEvent;
    const msg2 = { type: "message", channel: "C10", user: "U1", ts: "100.2" } as SlackMessageEvent;
    expect(buildSlackDebounceKey(msg1, "default")).not.toBe(buildSlackDebounceKey(msg2, "default"));

    const threadReply1 = {
      type: "message",
      channel: "C10",
      user: "U1",
      ts: "101.1",
      thread_ts: "100.1",
    } as SlackMessageEvent;
    const threadReply2 = {
      type: "message",
      channel: "C10",
      user: "U1",
      ts: "101.2",
      thread_ts: "100.1",
    } as SlackMessageEvent;
    expect(buildSlackDebounceKey(threadReply1, "default")).toBe(
      buildSlackDebounceKey(threadReply2, "default"),
    );

    const dm1 = { type: "message", channel: "D10", user: "U1", ts: "200.1" } as SlackMessageEvent;
    const dm2 = { type: "message", channel: "D10", user: "U1", ts: "200.2" } as SlackMessageEvent;
    expect(buildSlackDebounceKey(dm1, "default")).toBe(buildSlackDebounceKey(dm2, "default"));
  });

  it("normalizes mrkdwn escaping and deduplicates inherited parent thread files", async () => {
    expect(escapeSlackMrkdwn("a & b <tag> *bold* _it_ `code` ~s~")).toBe(
      "a &amp; b &lt;tag&gt; \\*bold\\* \\_it\\_ \\`code\\` \\~s\\~",
    );

    const resolved = await resolveSlackMessageContent({
      message: {
        type: "message",
        channel: "C1",
        ts: "100.2",
        text: "  Deploy status  ",
        files: [
          { id: "F_PARENT", name: "parent.png" },
          { id: "F_CHILD", name: "reply.log" },
        ],
      },
      isThreadReply: true,
      threadStarter: {
        text: "root",
        files: [{ id: "F_PARENT", name: "parent.png" }],
      },
      isBotMessage: false,
      botToken: "xoxb-test",
      mediaMaxBytes: 1024,
    });

    expect(resolved?.rawBody).toBe("Deploy status\n[Slack file: reply.log]");
  });

  it("enforces allowlist authorization on interactive approval block_action events", async () => {
    enqueueSystemEventMock.mockClear();
    let actionHandler: ((args: Record<string, unknown>) => Promise<void>) | null = null;
    const ctx = {
      app: {
        action: vi.fn((_re: RegExp, fn: (args: Record<string, unknown>) => Promise<void>) => {
          actionHandler = fn;
        }),
        view: vi.fn(),
        viewClosed: vi.fn(),
        client: { chat: { update: vi.fn().mockResolvedValue(undefined) } },
      },
      runtime: { log: vi.fn() },
      dmEnabled: true,
      dmPolicy: "allowlist" as const,
      allowFrom: ["U_ALLOWED"],
      allowNameMatching: false,
      channelsConfig: {},
      defaultRequireMention: true,
      shouldDropMismatchedSlackEvent: () => false,
      isChannelAllowed: () => true,
      resolveUserName: vi.fn().mockResolvedValue({}),
      resolveChannelName: vi.fn().mockResolvedValue({ type: "im" }),
      resolveSlackSystemEventSessionKey: vi.fn().mockReturnValue("agent:main:slack:dm:D1"),
    };
    registerSlackInteractionEvents({ ctx: ctx as never });
    expect(actionHandler).toBeTruthy();

    const ackDenied = vi.fn().mockResolvedValue(undefined);
    const respondDenied = vi.fn().mockResolvedValue(undefined);
    await actionHandler!({
      ack: ackDenied,
      respond: respondDenied,
      body: {
        user: { id: "U_INTRUDER" },
        channel: { id: "D1" },
        container: { channel_id: "D1", message_ts: "1.1" },
      },
      action: { type: "button", action_id: "approve_exec", value: "allow" },
    });
    expect(ackDenied).toHaveBeenCalled();
    expect(respondDenied).toHaveBeenCalledWith(
      expect.objectContaining({
        response_type: "ephemeral",
        text: expect.stringContaining("not authorized"),
      }),
    );
    expect(enqueueSystemEventMock).not.toHaveBeenCalled();

    const ackAllowed = vi.fn().mockResolvedValue(undefined);
    const respondAllowed = vi.fn().mockResolvedValue(undefined);
    await actionHandler!({
      ack: ackAllowed,
      respond: respondAllowed,
      body: {
        user: { id: "U_ALLOWED" },
        channel: { id: "D1" },
        container: { channel_id: "D1", message_ts: "1.2" },
      },
      action: { type: "button", action_id: "approve_exec", value: "allow" },
    });
    expect(ackAllowed).toHaveBeenCalled();
    expect(enqueueSystemEventMock).toHaveBeenCalledTimes(1);
    expect(enqueueSystemEventMock).toHaveBeenCalledWith(
      expect.stringContaining("approve_exec"),
      expect.objectContaining({ sessionKey: "agent:main:slack:dm:D1" }),
    );
  });
});
