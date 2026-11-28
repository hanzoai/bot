import type { Message } from "@grammyjs/types";
import { beforeEach, describe, expect, it } from "vitest";
import { createTelegramRetryRunner } from "../infra/retry-policy.js";
import {
  answerCallbackQuerySpy,
  getLoadConfigMock,
  onSpy,
  replySpy,
} from "./bot.create-telegram-bot.test-harness.js";
import { createTelegramBot, getTelegramSequentialKey } from "./bot.js";
import {
  describeReplyTarget,
  extractTelegramLocation,
  hasBotMention,
  resolveTelegramThreadSpec,
} from "./bot/helpers.js";

const loadConfig = getLoadConfigMock();

describe("Telegram rate-limit retry runner & sequential queue keys", () => {
  it("retries 429 errors using parameters.retry_after and response.parameters.retry_after", async () => {
    const run = createTelegramRetryRunner({
      retry: { attempts: 3, minDelayMs: 1, maxDelayMs: 10, jitter: 0 },
    });

    let calls = 0;
    const directRetryResult = await run(async () => {
      calls += 1;
      if (calls === 1) {
        throw {
          message: "429 Too Many Requests",
          parameters: { retry_after: 0.002 },
        };
      }
      return "ok-direct";
    }, "sendMessage");
    expect(directRetryResult).toBe("ok-direct");
    expect(calls).toBe(2);

    let nestedCalls = 0;
    const nestedRetryResult = await run(async () => {
      nestedCalls += 1;
      if (nestedCalls === 1) {
        throw {
          message: "429 Too Many Requests: retry later",
          response: { parameters: { retry_after: 0.002 } },
        };
      }
      return "ok-nested";
    }, "sendMessage");
    expect(nestedRetryResult).toBe("ok-nested");
    expect(nestedCalls).toBe(2);
  });

  it("does not retry non-transient 400 errors", async () => {
    const run = createTelegramRetryRunner({
      retry: { attempts: 3, minDelayMs: 1, maxDelayMs: 10, jitter: 0 },
    });
    let calls = 0;
    await expect(
      run(async () => {
        calls += 1;
        throw new Error("400 Bad Request: chat not found");
      }, "sendMessage"),
    ).rejects.toThrow("400 Bad Request");
    expect(calls).toBe(1);
  });

  it("separates forum topics, reaction updates, and urgent abort control lanes", () => {
    expect(
      getTelegramSequentialKey({
        message: {
          chat: { id: -1001, type: "supergroup", is_forum: true },
          message_thread_id: 42,
          text: "hello",
        } as unknown as Message,
      }),
    ).toBe("telegram:-1001:topic:42");

    expect(
      getTelegramSequentialKey({
        message: {
          chat: { id: -1001, type: "supergroup", is_forum: false },
          message_thread_id: 42,
          text: "reply inside non-forum",
        } as unknown as Message,
      }),
    ).toBe("telegram:-1001");

    expect(
      getTelegramSequentialKey({
        update: { message_reaction: { chat: { id: -1001 } } },
      }),
    ).toBe("telegram:-1001");

    expect(
      getTelegramSequentialKey({
        me: { username: "hanzo_bot" } as never,
        message: {
          chat: { id: -1001, type: "supergroup", is_forum: true },
          message_thread_id: 42,
          text: "/stop@hanzo_bot",
        } as unknown as Message,
      }),
    ).toBe("telegram:-1001:control");
  });
});

describe("Telegram inbound message normalization helpers", () => {
  it("detects explicit bot mentions case-insensitively across text and entities", () => {
    const mentionedText = {
      text: "Please @Hanzo_Bot check logs",
      entities: [],
    } as unknown as Message;
    expect(hasBotMention(mentionedText, "hanzo_bot")).toBe(true);

    const unmentionedText = {
      text: "plain chat message",
      entities: [],
    } as unknown as Message;
    expect(hasBotMention(unmentionedText, "hanzo_bot")).toBe(false);

    const captionMention = {
      caption: "Inspect with @HANZO_BOT",
      caption_entities: [{ type: "mention", offset: 13, length: 10 }],
    } as unknown as Message;
    expect(hasBotMention(captionMention, "hanzo_bot")).toBe(true);
  });

  it("extracts reply/quote targets, location types, and thread specs", () => {
    const quoted = {
      quote: { text: "  exact quoted span  " },
      reply_to_message: { text: "full original body", message_id: 9 },
    } as unknown as Message;
    expect(describeReplyTarget(quoted)).toEqual(
      expect.objectContaining({
        id: "9",
        kind: "quote",
        body: "exact quoted span",
      }),
    );

    const externalMediaReply = {
      external_reply: { photo: [{ file_id: "p1" }] },
    } as unknown as Message;
    expect(describeReplyTarget(externalMediaReply)).toEqual(
      expect.objectContaining({
        kind: "reply",
        body: "<media:image>",
      }),
    );

    expect(
      extractTelegramLocation({
        location: { latitude: 10.77, longitude: 106.7, live_period: 300, horizontal_accuracy: 15 },
      } as unknown as Message),
    ).toEqual({
      latitude: 10.77,
      longitude: 106.7,
      accuracy: 15,
      source: "live",
      isLive: true,
    });

    expect(
      extractTelegramLocation({
        venue: {
          title: "HQ",
          address: "1 Main St",
          location: { latitude: 37.77, longitude: -122.41 },
        },
      } as unknown as Message),
    ).toEqual({
      latitude: 37.77,
      longitude: -122.41,
      accuracy: undefined,
      name: "HQ",
      address: "1 Main St",
      source: "place",
      isLive: false,
    });

    expect(resolveTelegramThreadSpec({ isGroup: false, messageThreadId: 7 })).toEqual({
      id: 7,
      scope: "dm",
    });
    expect(
      resolveTelegramThreadSpec({ isGroup: true, isForum: false, messageThreadId: 7 }),
    ).toEqual({
      id: undefined,
      scope: "none",
    });
  });
});

describe("Telegram callback_query scope and allowlist gating", () => {
  beforeEach(() => {
    onSpy.mockClear();
    replySpy.mockClear();
    answerCallbackQuerySpy.mockClear();
  });

  function getCallbackHandler() {
    createTelegramBot({ token: "tok" });
    const handler = onSpy.mock.calls.find((call) => call[0] === "callback_query")?.[1] as
      | ((ctx: Record<string, unknown>) => Promise<void>)
      | undefined;
    expect(handler).toBeDefined();
    return handler!;
  }

  it("drops callback queries when inlineButtons is off or scoped away from chat type", async () => {
    loadConfig.mockReturnValue({
      channels: {
        telegram: { dmPolicy: "open", allowFrom: ["*"], capabilities: { inlineButtons: "off" } },
      },
    });
    await getCallbackHandler()({
      callbackQuery: {
        id: "cb-off",
        data: "approve:1",
        from: { id: 10, username: "alice" },
        message: { chat: { id: 10, type: "private" }, date: 1736380800, message_id: 1 },
      },
      me: { username: "hanzo_bot" },
    });
    expect(answerCallbackQuerySpy).toHaveBeenCalledWith("cb-off");
    expect(replySpy).not.toHaveBeenCalled();

    onSpy.mockClear();
    answerCallbackQuerySpy.mockClear();
    loadConfig.mockReturnValue({
      channels: {
        telegram: {
          dmPolicy: "open",
          allowFrom: ["*"],
          groupPolicy: "open",
          capabilities: { inlineButtons: "dm" },
        },
      },
    });
    await getCallbackHandler()({
      callbackQuery: {
        id: "cb-group-blocked",
        data: "approve:2",
        from: { id: 10, username: "alice" },
        message: { chat: { id: -200, type: "supergroup" }, date: 1736380800, message_id: 2 },
      },
      me: { username: "hanzo_bot" },
    });
    expect(replySpy).not.toHaveBeenCalled();
  });

  it("blocks unauthorized callback senders under allowlist scope and dispatches authorized approvers", async () => {
    loadConfig.mockReturnValue({
      channels: {
        telegram: {
          dmPolicy: "allowlist",
          allowFrom: ["9001"],
          capabilities: { inlineButtons: "allowlist" },
        },
      },
    });
    const handler = getCallbackHandler();

    await handler({
      callbackQuery: {
        id: "cb-unauth",
        data: "execapproval:allow",
        from: { id: 404, username: "intruder" },
        message: { chat: { id: 404, type: "private" }, date: 1736380800, message_id: 3 },
      },
      me: { username: "hanzo_bot" },
      getFile: async () => ({ download: async () => new Uint8Array() }),
    });
    expect(replySpy).not.toHaveBeenCalled();

    await handler({
      callbackQuery: {
        id: "cb-auth",
        data: "execapproval:allow",
        from: { id: 9001, first_name: "Trusted", username: "trusted" },
        message: { chat: { id: 9001, type: "private" }, date: 1736380800, message_id: 4 },
      },
      me: { username: "hanzo_bot" },
      getFile: async () => ({ download: async () => new Uint8Array() }),
    });
    expect(replySpy).toHaveBeenCalledTimes(1);
    expect(replySpy.mock.calls[0]?.[0].Body).toContain("execapproval:allow");
  });
});
