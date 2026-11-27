import { describe, expect, it } from "vitest";
import {
  resolveSlackChannelConfig,
  resolveSlackChannelLabel,
  shouldEmitSlackReactionNotification,
} from "./channel-config.js";

describe("shouldEmitSlackReactionNotification", () => {
  it("never emits when mode is off", () => {
    expect(
      shouldEmitSlackReactionNotification({
        mode: "off",
        botId: "B1",
        messageAuthorId: "B1",
        userId: "U1",
      }),
    ).toBe(false);
  });

  it("defaults to own mode when mode is undefined", () => {
    expect(
      shouldEmitSlackReactionNotification({
        mode: undefined,
        botId: "B1",
        messageAuthorId: "B1",
        userId: "U1",
      }),
    ).toBe(true);
    expect(
      shouldEmitSlackReactionNotification({
        mode: undefined,
        botId: "B1",
        messageAuthorId: "U2",
        userId: "U1",
      }),
    ).toBe(false);
  });

  it("own mode requires both bot id and message author id", () => {
    expect(
      shouldEmitSlackReactionNotification({
        mode: "own",
        botId: null,
        messageAuthorId: "B1",
        userId: "U1",
      }),
    ).toBe(false);
    expect(
      shouldEmitSlackReactionNotification({
        mode: "own",
        botId: "B1",
        messageAuthorId: null,
        userId: "U1",
      }),
    ).toBe(false);
    expect(shouldEmitSlackReactionNotification({ mode: "own", botId: "B1", userId: "U1" })).toBe(
      false,
    );
  });

  it("all mode always emits", () => {
    expect(shouldEmitSlackReactionNotification({ mode: "all", userId: "U1" })).toBe(true);
  });

  it("allowlist mode rejects when the allowlist is missing or empty", () => {
    expect(
      shouldEmitSlackReactionNotification({
        mode: "allowlist",
        userId: "U1",
        allowlist: undefined,
      }),
    ).toBe(false);
    expect(
      shouldEmitSlackReactionNotification({ mode: "allowlist", userId: "U1", allowlist: null }),
    ).toBe(false);
    expect(
      shouldEmitSlackReactionNotification({ mode: "allowlist", userId: "U1", allowlist: [] }),
    ).toBe(false);
  });

  it("allowlist mode matches ids case-insensitively and accepts slack:/user: prefixes", () => {
    expect(
      shouldEmitSlackReactionNotification({
        mode: "allowlist",
        userId: "U123",
        allowlist: ["u123"],
      }),
    ).toBe(true);
    expect(
      shouldEmitSlackReactionNotification({
        mode: "allowlist",
        userId: "U123",
        allowlist: ["slack:U123"],
      }),
    ).toBe(true);
    expect(
      shouldEmitSlackReactionNotification({
        mode: "allowlist",
        userId: "U123",
        allowlist: ["user:U123"],
      }),
    ).toBe(true);
    expect(
      shouldEmitSlackReactionNotification({
        mode: "allowlist",
        userId: "U999",
        allowlist: ["U123"],
      }),
    ).toBe(false);
  });

  it("allowlist mode supports numeric entries and the wildcard", () => {
    expect(
      shouldEmitSlackReactionNotification({ mode: "allowlist", userId: "42", allowlist: [42] }),
    ).toBe(true);
    expect(
      shouldEmitSlackReactionNotification({ mode: "allowlist", userId: "U1", allowlist: ["*"] }),
    ).toBe(true);
  });

  it("allowlist mode only matches by name when name matching is enabled", () => {
    const base = {
      mode: "allowlist" as const,
      userId: "U1",
      userName: "Alice",
      allowlist: ["alice"],
    };
    expect(shouldEmitSlackReactionNotification(base)).toBe(false);
    expect(shouldEmitSlackReactionNotification({ ...base, allowNameMatching: false })).toBe(false);
    expect(shouldEmitSlackReactionNotification({ ...base, allowNameMatching: true })).toBe(true);
  });
});

describe("resolveSlackChannelLabel", () => {
  it("prefers the slugged channel name", () => {
    expect(resolveSlackChannelLabel({ channelId: "C1", channelName: "General Chat" })).toBe(
      "#general-chat",
    );
  });

  it("trims the channel name and falls back to it when the slug is empty", () => {
    expect(resolveSlackChannelLabel({ channelName: "  eng  " })).toBe("#eng");
    expect(resolveSlackChannelLabel({ channelName: "***" })).toBe("#***");
  });

  it("falls back to the channel id when there is no usable name", () => {
    expect(resolveSlackChannelLabel({ channelId: " C123 " })).toBe("#C123");
    expect(resolveSlackChannelLabel({ channelId: "C123", channelName: "   " })).toBe("#C123");
  });

  it("returns a placeholder when nothing is known", () => {
    expect(resolveSlackChannelLabel({})).toBe("unknown channel");
    expect(resolveSlackChannelLabel({ channelId: "  " })).toBe("unknown channel");
  });
});

describe("resolveSlackChannelConfig matching and merging", () => {
  it("denies channels that match neither an entry nor a wildcard", () => {
    expect(
      resolveSlackChannelConfig({
        channelId: "C2",
        channels: { C1: { allow: true } },
        defaultRequireMention: false,
      }),
    ).toEqual({ allowed: false, requireMention: false });
  });

  it("matches by #name, plain name, and slug", () => {
    const byHash = resolveSlackChannelConfig({
      channelId: "C1",
      channelName: "general",
      channels: { "#general": { requireMention: false } },
    });
    expect(byHash).toMatchObject({ allowed: true, requireMention: false, matchKey: "#general" });

    const byName = resolveSlackChannelConfig({
      channelId: "C1",
      channelName: "general",
      channels: { general: { requireMention: false } },
    });
    expect(byName).toMatchObject({ allowed: true, requireMention: false, matchKey: "general" });

    const bySlug = resolveSlackChannelConfig({
      channelId: "C1",
      channelName: "Team Alpha",
      channels: { "team-alpha": { requireMention: false } },
    });
    expect(bySlug).toMatchObject({ allowed: true, requireMention: false, matchKey: "team-alpha" });
  });

  it("prefers a direct id match over a name match", () => {
    const res = resolveSlackChannelConfig({
      channelId: "C1",
      channelName: "general",
      channels: {
        C1: { requireMention: false },
        general: { requireMention: true },
      },
    });
    expect(res).toMatchObject({ requireMention: false, matchKey: "C1", matchSource: "direct" });
  });

  it("honors an explicit allow:false on the matched entry", () => {
    const res = resolveSlackChannelConfig({
      channelId: "C1",
      channels: { C1: { allow: false }, "*": { allow: true } },
    });
    expect(res).toMatchObject({ allowed: false });
  });

  it("lets enabled take precedence over allow", () => {
    const res = resolveSlackChannelConfig({
      channelId: "C1",
      channels: { C1: { enabled: false, allow: true } },
    });
    expect(res).toMatchObject({ allowed: false });
  });

  it("falls back to wildcard settings for fields the direct entry omits", () => {
    const res = resolveSlackChannelConfig({
      channelId: "C1",
      channels: {
        C1: { allow: true },
        "*": {
          requireMention: false,
          allowBots: true,
          users: ["U1", 2],
          skills: ["search"],
          systemPrompt: "be brief",
        },
      },
      defaultRequireMention: true,
    });
    expect(res).toMatchObject({
      allowed: true,
      requireMention: false,
      allowBots: true,
      users: ["U1", 2],
      skills: ["search"],
      systemPrompt: "be brief",
      matchSource: "direct",
    });
  });

  it("keeps direct settings over wildcard settings", () => {
    const res = resolveSlackChannelConfig({
      channelId: "C1",
      channels: {
        C1: { requireMention: true, users: ["U9"], systemPrompt: "direct" },
        "*": { requireMention: false, users: ["U1"], systemPrompt: "wild" },
      },
    });
    expect(res).toMatchObject({
      requireMention: true,
      users: ["U9"],
      systemPrompt: "direct",
    });
  });

  it("uses explicit channelKeys instead of the entry keys when deciding whether config is empty", () => {
    const res = resolveSlackChannelConfig({
      channelId: "C1",
      channels: {},
      channelKeys: [],
      defaultRequireMention: false,
    });
    expect(res).toEqual({ allowed: true, requireMention: false });
  });
});
