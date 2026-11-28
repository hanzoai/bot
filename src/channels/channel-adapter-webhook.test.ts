import { describe, expect, it } from "vitest";

type ChannelKind = "slack" | "discord" | "telegram";

interface NormalizedInboundMessage {
  channel: ChannelKind;
  senderId: string;
  conversationId: string;
  text: string;
  threadId?: string;
}

function normalizeInboundWebhook(
  channel: ChannelKind,
  payload: Record<string, unknown>,
): NormalizedInboundMessage {
  if (channel === "slack") {
    const event = (payload.event ?? payload) as Record<string, unknown>;
    return {
      channel: "slack",
      senderId: String(event.user ?? ""),
      conversationId: String(event.channel ?? ""),
      text: String(event.text ?? "").trim(),
      threadId: event.thread_ts ? String(event.thread_ts) : undefined,
    };
  }
  if (channel === "discord") {
    const author = (payload.author ?? {}) as Record<string, unknown>;
    const ref = (payload.message_reference ?? {}) as Record<string, unknown>;
    return {
      channel: "discord",
      senderId: String(author.id ?? ""),
      conversationId: String(payload.channel_id ?? ""),
      text: String(payload.content ?? "").trim(),
      threadId: ref.message_id ? String(ref.message_id) : undefined,
    };
  }
  const msg = (payload.message ?? payload) as Record<string, unknown>;
  const from = (msg.from ?? {}) as Record<string, unknown>;
  const chat = (msg.chat ?? {}) as Record<string, unknown>;
  return {
    channel: "telegram",
    senderId: String(from.id ?? ""),
    conversationId: String(chat.id ?? ""),
    text: String(msg.text ?? "").trim(),
    threadId: msg.message_thread_id ? String(msg.message_thread_id) : undefined,
  };
}

class ChannelRateLimiter {
  private readonly hits = new Map<string, number[]>();
  constructor(
    private readonly maxRequests: number,
    private readonly windowMs: number,
  ) {}

  allow(key: string, nowMs: number): boolean {
    const cutoff = nowMs - this.windowMs;
    const recent = (this.hits.get(key) ?? []).filter((t) => t > cutoff);
    if (recent.length >= this.maxRequests) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(nowMs);
    this.hits.set(key, recent);
    return true;
  }
}

function buildToolApprovalPrompt(channel: ChannelKind, approvalId: string, toolName: string) {
  const promptText = `Approve tool execution: ${toolName}`;
  if (channel === "slack") {
    return {
      text: promptText,
      blocks: [
        {
          type: "actions",
          elements: [
            { type: "button", text: { type: "plain_text", text: "Approve" }, value: `approve:${approvalId}` },
            { type: "button", text: { type: "plain_text", text: "Deny" }, value: `deny:${approvalId}` },
          ],
        },
      ],
    };
  }
  if (channel === "discord") {
    return {
      content: promptText,
      components: [
        {
          type: 1,
          components: [
            { type: 2, label: "Approve", custom_id: `approve:${approvalId}` },
            { type: 2, label: "Deny", custom_id: `deny:${approvalId}` },
          ],
        },
      ],
    };
  }
  return {
    text: promptText,
    reply_markup: {
      inline_keyboard: [
        [
          { text: "Approve", callback_data: `approve:${approvalId}` },
          { text: "Deny", callback_data: `deny:${approvalId}` },
        ],
      ],
    },
  };
}

describe("channel adapter webhook normalization, rate limiting, and tool-approval prompts", () => {
  it("normalizes Slack, Discord, and Telegram inbound payloads", () => {
    expect(
      normalizeInboundWebhook("slack", {
        event: { user: "U123", channel: "C456", text: "  /status  ", thread_ts: "1700.1" },
      }),
    ).toEqual({
      channel: "slack",
      senderId: "U123",
      conversationId: "C456",
      text: "/status",
      threadId: "1700.1",
    });

    expect(
      normalizeInboundWebhook("discord", {
        author: { id: "D789" },
        channel_id: "CH01",
        content: " hello bot ",
        message_reference: { message_id: "M99" },
      }),
    ).toEqual({
      channel: "discord",
      senderId: "D789",
      conversationId: "CH01",
      text: "hello bot",
      threadId: "M99",
    });

    expect(
      normalizeInboundWebhook("telegram", {
        message: { from: { id: 42 }, chat: { id: -1001 }, text: " /help ", message_thread_id: 7 },
      }),
    ).toEqual({
      channel: "telegram",
      senderId: "42",
      conversationId: "-1001",
      text: "/help",
      threadId: "7",
    });
  });

  it("enforces deterministic per-channel rate limiting", () => {
    const limiter = new ChannelRateLimiter(2, 1000);
    expect(limiter.allow("slack:U123", 100)).toBe(true);
    expect(limiter.allow("slack:U123", 500)).toBe(true);
    expect(limiter.allow("slack:U123", 900)).toBe(false);
    expect(limiter.allow("slack:U123", 1200)).toBe(true);
  });

  it("builds interactive tool-approval prompts for all three channels", () => {
    const slack = buildToolApprovalPrompt("slack", "apr-1", "shell.exec");
    expect(slack.blocks?.[0].elements.map((e) => e.value)).toEqual(["approve:apr-1", "deny:apr-1"]);

    const discord = buildToolApprovalPrompt("discord", "apr-2", "fs.write");
    expect(discord.components?.[0].components.map((c) => c.custom_id)).toEqual([
      "approve:apr-2",
      "deny:apr-2",
    ]);

    const telegram = buildToolApprovalPrompt("telegram", "apr-3", "git.push");
    expect(telegram.reply_markup?.inline_keyboard[0].map((b) => b.callback_data)).toEqual([
      "approve:apr-3",
      "deny:apr-3",
    ]);
  });
});
