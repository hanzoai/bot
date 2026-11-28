import { RateLimitError, type Message } from "@buape/carbon";
import type { ButtonInteraction } from "@buape/carbon";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createChannelInboundDebouncer,
  shouldDebounceTextInbound,
} from "../../channels/inbound-debounce-policy.js";
import type { BotConfig } from "../../config/config.js";
import { createDiscordRetryRunner } from "../../infra/retry-policy.js";
import {
  DiscordExecApprovalHandler,
  ExecApprovalButton,
  buildExecApprovalCustomId,
  parseExecApprovalData,
} from "./exec-approvals.js";
import {
  hasDiscordMessageStickers,
  resolveDiscordEmbedText,
  resolveDiscordMessageChannelId,
  resolveDiscordMessageText,
} from "./message-utils.js";

function makeRateLimitError(retryAfterSec = 0.005): RateLimitError {
  return new RateLimitError(
    new Response(
      JSON.stringify({ message: "You are being rate limited.", retry_after: retryAfterSec }),
      {
        status: 429,
        headers: { "content-type": "application/json" },
      },
    ),
    { message: "You are being rate limited.", retry_after: retryAfterSec, global: false },
    new Request("https://discord.com/api/v10/channels/123/messages", { method: "POST" }),
  );
}

describe("Discord rate-limit retry runner", () => {
  it("retries RateLimitError (429) responses and resolves on subsequent success", async () => {
    const run = createDiscordRetryRunner({
      retry: { attempts: 3, minDelayMs: 1, maxDelayMs: 10, jitter: 0 },
    });
    let calls = 0;
    const result = await run(async () => {
      calls += 1;
      if (calls === 1) {
        throw makeRateLimitError(0.002);
      }
      return "delivered";
    }, "send-message");

    expect(result).toBe("delivered");
    expect(calls).toBe(2);
  });

  it("does not retry non-RateLimitError failures and propagates exhaustion on repeated 429s", async () => {
    const run = createDiscordRetryRunner({
      retry: { attempts: 2, minDelayMs: 1, maxDelayMs: 5, jitter: 0 },
    });

    let nonRateLimitCalls = 0;
    await expect(
      run(async () => {
        nonRateLimitCalls += 1;
        throw new Error("403 Missing Permissions");
      }, "send-message"),
    ).rejects.toThrow("403 Missing Permissions");
    expect(nonRateLimitCalls).toBe(1);

    let exhaustedCalls = 0;
    await expect(
      run(async () => {
        exhaustedCalls += 1;
        throw makeRateLimitError(0.001);
      }, "send-message"),
    ).rejects.toBeInstanceOf(RateLimitError);
    expect(exhaustedCalls).toBe(2);
  });
});

describe("Discord inbound message normalization and debounce gating", () => {
  it("resolves channel IDs and normalizes plain text, embeds, stickers, and forwarded messages", () => {
    const baseMsg = {
      channelId: "",
      rawData: { channel_id: "998877" },
      content: "  ",
      embeds: [{ title: "Deploy Alert", description: "Canary green" }],
      attachments: [],
    } as unknown as Message;
    expect(resolveDiscordMessageChannelId({ message: baseMsg })).toBe("998877");
    expect(resolveDiscordEmbedText(baseMsg.embeds?.[0])).toBe("Deploy Alert\nCanary green");
    expect(resolveDiscordMessageText(baseMsg)).toBe("Deploy Alert\nCanary green");

    const stickerMsg = {
      channelId: "123",
      content: "",
      stickers: [{ id: "stk_1", name: "wave" }],
      attachments: [],
    } as unknown as Message;
    expect(hasDiscordMessageStickers(stickerMsg)).toBe(true);
    expect(resolveDiscordMessageText(stickerMsg)).toBe("<media:sticker> (1 sticker)");

    const forwardedMsg = {
      channelId: "123",
      content: "Look at this",
      attachments: [],
      messageSnapshots: [
        { message: { content: "Forwarded payload", embeds: [], attachments: [] } },
      ],
    } as unknown as Message;
    expect(resolveDiscordMessageText(forwardedMsg, { includeForwarded: true })).toContain(
      "Forwarded message",
    );
  });

  it("coaxes rapid text bursts via debouncer while bypassing media and control commands", async () => {
    const cfg = { messages: { inbound: { debounceMs: 15 } } } as BotConfig;
    expect(shouldDebounceTextInbound({ text: "hello", cfg })).toBe(true);
    expect(shouldDebounceTextInbound({ text: "/stop", cfg })).toBe(false);
    expect(shouldDebounceTextInbound({ text: "see image", cfg, hasMedia: true })).toBe(false);

    const flushed: string[][] = [];
    const { debouncer } = createChannelInboundDebouncer<{ key: string; text: string }>({
      cfg,
      channel: "discord",
      buildKey: (entry) => entry.key,
      shouldDebounce: (entry) => shouldDebounceTextInbound({ text: entry.text, cfg }),
      onFlush: async (entries) => {
        flushed.push(entries.map((entry) => entry.text));
      },
    });

    await debouncer.enqueue({ key: "discord:default:C1:U1", text: "part 1" });
    await debouncer.enqueue({ key: "discord:default:C1:U1", text: "part 2" });
    await debouncer.flushKey("discord:default:C1:U1");

    expect(flushed).toEqual([["part 1", "part 2"]]);
  });
});

describe("Discord interactive approval IDs, timer cleanup, and expired callbacks", () => {
  const handlers: DiscordExecApprovalHandler[] = [];

  afterEach(async () => {
    for (const h of handlers.splice(0)) {
      await h.stop();
    }
  });

  it("round-trips approval IDs containing special delimiter characters", () => {
    const id = "req:team/ops;node=1";
    const encoded = buildExecApprovalCustomId(id, "allow-always");
    const parsedId = (encoded.split(";")[0] ?? "").replace("execapproval:id=", "");
    const parsed = parseExecApprovalData({ id: parsedId, action: "allow-always" });
    expect(parsed).toEqual({ approvalId: id, action: "allow-always" });
  });

  it("reports expiration follow-up when gateway client is disconnected and cleans timers on stop", async () => {
    const handler = new DiscordExecApprovalHandler({
      token: "test-token",
      accountId: "default",
      config: { enabled: true, approvers: ["U_APPROVER"] },
      cfg: {},
    });
    handlers.push(handler);

    const internals = handler as unknown as {
      started: boolean;
      pending: Map<
        string,
        { discordMessageId: string; discordChannelId: string; timeoutId: NodeJS.Timeout }
      >;
    };
    internals.started = true;
    internals.pending.set("ap-1:dm", {
      discordMessageId: "m-1",
      discordChannelId: "dm-1",
      timeoutId: setTimeout(() => {}, 60_000),
    });

    const button = new ExecApprovalButton({ handler });
    const update = vi.fn().mockResolvedValue(undefined);
    const followUp = vi.fn().mockResolvedValue(undefined);
    const reply = vi.fn().mockResolvedValue(undefined);
    await button.run(
      { userId: "U_APPROVER", update, followUp, reply } as unknown as ButtonInteraction,
      { id: "ap-1", action: "deny" },
    );

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("Denied"),
        components: [],
      }),
    );
    expect(followUp).toHaveBeenCalledWith(
      expect.objectContaining({
        ephemeral: true,
        content: expect.stringContaining("Failed to submit approval decision"),
      }),
    );

    await handler.stop();
    expect(internals.pending.size).toBe(0);
  });
});
