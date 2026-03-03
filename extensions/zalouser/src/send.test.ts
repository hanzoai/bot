import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  sendDeliveredZalouser,
  sendImageZalouser,
  sendLinkZalouser,
  sendMessageZalouser,
  sendReactionZalouser,
  sendSeenZalouser,
  sendTypingZalouser,
} from "./send.js";
import {
  sendZaloDeliveredEvent,
  sendZaloLink,
  sendZaloReaction,
  sendZaloSeenEvent,
  sendZaloTextMessage,
  sendZaloTypingEvent,
} from "./zalo-js.js";

vi.mock("./zalo-js.js", () => ({
  sendZaloTextMessage: vi.fn(),
  sendZaloLink: vi.fn(),
  sendZaloTypingEvent: vi.fn(),
  sendZaloReaction: vi.fn(),
  sendZaloDeliveredEvent: vi.fn(),
  sendZaloSeenEvent: vi.fn(),
}));

const mockSendText = vi.mocked(sendZaloTextMessage);
const mockSendLink = vi.mocked(sendZaloLink);
const mockSendTyping = vi.mocked(sendZaloTypingEvent);
const mockSendReaction = vi.mocked(sendZaloReaction);
const mockSendDelivered = vi.mocked(sendZaloDeliveredEvent);
const mockSendSeen = vi.mocked(sendZaloSeenEvent);

describe("zalouser send helpers", () => {
  beforeEach(() => {
    mockSendText.mockReset();
    mockSendLink.mockReset();
    mockSendTyping.mockReset();
    mockSendReaction.mockReset();
    mockSendDelivered.mockReset();
    mockSendSeen.mockReset();
  });

  it("delegates text send to JS transport", async () => {
    mockSendText.mockResolvedValueOnce({ ok: true, messageId: "mid-1" });

    const result = await sendMessageZalouser("thread-1", "hello", {
      profile: "default",
      isGroup: true,
    });

    expect(mockSendText).toHaveBeenCalledWith("thread-1", "hello", {
      profile: "default",
      isGroup: true,
    });
    expect(result).toEqual({ ok: true, messageId: "mid-1" });
  });

  it("maps image helper to media send", async () => {
    mockSendText.mockResolvedValueOnce({ ok: true, messageId: "mid-2" });

    await sendImageZalouser("thread-2", "https://example.com/a.png", {
      profile: "p2",
      caption: "cap",
      isGroup: false,
    });

    expect(mockSendText).toHaveBeenCalledWith("thread-2", "cap", {
      profile: "p2",
      caption: "cap",
      isGroup: false,
      mediaUrl: "https://example.com/a.png",
    });
  });

  it("delegates link helper to JS transport", async () => {
    mockSendLink.mockResolvedValueOnce({ ok: false, error: "boom" });

    const result = await sendLinkZalouser("thread-3", "https://hanzo.bot", {
      profile: "p3",
      isGroup: true,
    });

    expect(mockSendLink).toHaveBeenCalledWith("thread-3", "https://hanzo.bot", {
      profile: "p3",
      isGroup: true,
    });
    expect(result).toEqual({ ok: false, error: "boom" });
  });

  it("delegates typing helper to JS transport", async () => {
    await sendTypingZalouser("thread-4", { profile: "p4", isGroup: true });

    const result = await sendLinkZalouser("thread-5", " https://hanzo.bot ", { isGroup: true });

    expect(mockRunZca).toHaveBeenCalledWith(
      ["msg", "link", "thread-5", "https://hanzo.bot", "-g"],
      { profile: "env-profile" },
    );
    expect(result).toEqual({ ok: true, messageId: "abc123" });
  });

  it("delegates reaction helper to JS transport", async () => {
    mockSendReaction.mockResolvedValueOnce({ ok: true });

    await expect(sendLinkZalouser("thread-6", "https://hanzo.bot")).resolves.toEqual({
      ok: false,
      error: "zca unavailable",
    });
  });
});
