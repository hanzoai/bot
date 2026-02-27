import { describe, expect, it } from "vitest";
import { resolveIrcInboundTarget } from "./monitor.js";

describe("irc monitor inbound target", () => {
  it("keeps channel target for group messages", () => {
    expect(
      resolveIrcInboundTarget({
        target: "#bot",
        senderNick: "alice",
      }),
    ).toEqual({
      isGroup: true,
      target: "#bot",
      rawTarget: "#bot",
    });
  });

  it("maps DM target to sender nick and preserves raw target", () => {
    expect(
      resolveIrcInboundTarget({
        target: "hanzo-bot",
        senderNick: "alice",
      }),
    ).toEqual({
      isGroup: false,
      target: "alice",
      rawTarget: "hanzo-bot",
    });
  });

  it("falls back to raw target when sender nick is empty", () => {
    expect(
      resolveIrcInboundTarget({
        target: "hanzo-bot",
        senderNick: " ",
      }),
    ).toEqual({
      isGroup: false,
      target: "hanzo-bot",
      rawTarget: "hanzo-bot",
    });
  });
});
