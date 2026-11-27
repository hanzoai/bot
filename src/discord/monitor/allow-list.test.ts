import { describe, expect, it } from "vitest";
import {
  allowListMatches,
  normalizeDiscordAllowList,
  normalizeDiscordSlug,
  resolveDiscordAllowListMatch,
  resolveDiscordMemberAccessState,
  resolveDiscordOwnerAccess,
  resolveDiscordOwnerAllowFrom,
  resolveDiscordRoleAllowed,
  resolveDiscordUserAllowed,
} from "./allow-list.js";

const PREFIXES = ["discord:", "user:", "pk:"];

describe("normalizeDiscordSlug", () => {
  it("lowercases, strips a leading #, and collapses punctuation into hyphens", () => {
    expect(normalizeDiscordSlug("  #General Chat!! ")).toBe("general-chat");
    expect(normalizeDiscordSlug("Foo___Bar")).toBe("foo-bar");
  });

  it("trims leading and trailing hyphens and handles empty results", () => {
    expect(normalizeDiscordSlug("--abc--")).toBe("abc");
    expect(normalizeDiscordSlug("###")).toBe("");
    expect(normalizeDiscordSlug("")).toBe("");
  });
});

describe("normalizeDiscordAllowList", () => {
  it("returns null for missing or empty lists", () => {
    expect(normalizeDiscordAllowList(undefined, PREFIXES)).toBeNull();
    expect(normalizeDiscordAllowList([], PREFIXES)).toBeNull();
  });

  it("flags wildcard entries", () => {
    expect(normalizeDiscordAllowList(["*"], PREFIXES)).toMatchObject({ allowAll: true });
    expect(normalizeDiscordAllowList([" * ", "123"], PREFIXES)).toMatchObject({ allowAll: true });
  });

  it("extracts ids from raw ids, mentions, and prefixed entries", () => {
    const list = normalizeDiscordAllowList(
      ["111", "<@222>", "<@!333>", "discord:444", "user:555", "pk:member-1"],
      PREFIXES,
    );
    expect(list?.allowAll).toBe(false);
    expect([...(list?.ids ?? [])].toSorted()).toEqual(
      ["111", "222", "333", "444", "555", "member-1"].toSorted(),
    );
    expect(list?.names.size).toBe(0);
  });

  it("treats non-id, non-prefixed entries as slugged names and ignores blanks", () => {
    const list = normalizeDiscordAllowList(["Alice Smith", "  ", "alice#1234", "user:"], PREFIXES);
    expect([...(list?.names ?? [])].toSorted()).toEqual(["alice-1234", "alice-smith"]);
    expect(list?.ids.size).toBe(0);
  });
});

describe("allowListMatches / resolveDiscordAllowListMatch", () => {
  const list = normalizeDiscordAllowList(["123", "alice", "bob#0001"], PREFIXES);
  if (!list) {
    throw new Error("expected allow list");
  }

  it("matches ids without needing name matching", () => {
    expect(allowListMatches(list, { id: "123" })).toBe(true);
    expect(resolveDiscordAllowListMatch({ allowList: list, candidate: { id: "123" } })).toEqual({
      allowed: true,
      matchKey: "123",
      matchSource: "id",
    });
  });

  it("ignores names and tags unless name matching is enabled", () => {
    expect(allowListMatches(list, { id: "999", name: "Alice" })).toBe(false);
    expect(
      resolveDiscordAllowListMatch({ allowList: list, candidate: { id: "999", name: "Alice" } }),
    ).toEqual({ allowed: false });
    expect(
      resolveDiscordAllowListMatch({
        allowList: list,
        candidate: { name: "Alice" },
        allowNameMatching: false,
      }),
    ).toEqual({ allowed: false });
  });

  it("matches names and tags when name matching is enabled", () => {
    expect(allowListMatches(list, { name: "Alice" }, { allowNameMatching: true })).toBe(true);
    expect(allowListMatches(list, { tag: "Bob#0001" }, { allowNameMatching: true })).toBe(true);
    expect(
      resolveDiscordAllowListMatch({
        allowList: list,
        candidate: { name: "ALICE" },
        allowNameMatching: true,
      }),
    ).toEqual({ allowed: true, matchKey: "alice", matchSource: "name" });
    expect(
      resolveDiscordAllowListMatch({
        allowList: list,
        candidate: { tag: "bob#0001" },
        allowNameMatching: true,
      }),
    ).toEqual({ allowed: true, matchKey: "bob-0001", matchSource: "tag" });
  });

  it("reports wildcard matches", () => {
    const wildcard = normalizeDiscordAllowList(["*"], PREFIXES);
    if (!wildcard) {
      throw new Error("expected allow list");
    }
    expect(allowListMatches(wildcard, { id: "anything" })).toBe(true);
    expect(resolveDiscordAllowListMatch({ allowList: wildcard, candidate: {} })).toEqual({
      allowed: true,
      matchKey: "*",
      matchSource: "wildcard",
    });
  });
});

describe("resolveDiscordUserAllowed", () => {
  it("allows everyone when no allowlist is configured", () => {
    expect(resolveDiscordUserAllowed({ allowList: undefined, userId: "1" })).toBe(true);
    expect(resolveDiscordUserAllowed({ allowList: [], userId: "1" })).toBe(true);
  });

  it("accepts discord:/user:/pk: prefixed ids and rejects strangers", () => {
    expect(resolveDiscordUserAllowed({ allowList: ["discord:1"], userId: "1" })).toBe(true);
    expect(resolveDiscordUserAllowed({ allowList: ["user:1"], userId: "1" })).toBe(true);
    expect(resolveDiscordUserAllowed({ allowList: ["pk:1"], userId: "1" })).toBe(true);
    expect(resolveDiscordUserAllowed({ allowList: ["user:1"], userId: "2" })).toBe(false);
  });

  it("only matches usernames when name matching is enabled", () => {
    const base = { allowList: ["alice"], userId: "9", userName: "Alice" };
    expect(resolveDiscordUserAllowed(base)).toBe(false);
    expect(resolveDiscordUserAllowed({ ...base, allowNameMatching: true })).toBe(true);
  });
});

describe("resolveDiscordRoleAllowed", () => {
  it("allows everyone when no role allowlist is configured", () => {
    expect(resolveDiscordRoleAllowed({ allowList: undefined, memberRoleIds: [] })).toBe(true);
    expect(resolveDiscordRoleAllowed({ allowList: [], memberRoleIds: ["1"] })).toBe(true);
  });

  it("allows members holding any listed role id, including role:-prefixed entries", () => {
    expect(resolveDiscordRoleAllowed({ allowList: ["10", "20"], memberRoleIds: ["20"] })).toBe(
      true,
    );
    expect(resolveDiscordRoleAllowed({ allowList: ["role:30"], memberRoleIds: ["30"] })).toBe(true);
  });

  it("rejects members without a listed role and ignores role names", () => {
    expect(resolveDiscordRoleAllowed({ allowList: ["10"], memberRoleIds: ["11"] })).toBe(false);
    expect(resolveDiscordRoleAllowed({ allowList: ["10"], memberRoleIds: [] })).toBe(false);
    expect(resolveDiscordRoleAllowed({ allowList: ["admins"], memberRoleIds: ["admins"] })).toBe(
      false,
    );
  });

  it("allows everyone for a wildcard role entry", () => {
    expect(resolveDiscordRoleAllowed({ allowList: ["*"], memberRoleIds: [] })).toBe(true);
  });
});

describe("resolveDiscordMemberAccessState", () => {
  const sender = { id: "42" };

  it("reports no restrictions when neither channel nor guild restricts access", () => {
    const state = resolveDiscordMemberAccessState({ memberRoleIds: [], sender });
    expect(state.hasAccessRestrictions).toBe(false);
    expect(state.memberAllowed).toBe(true);
  });

  it("prefers channel-level lists over guild-level lists", () => {
    const state = resolveDiscordMemberAccessState({
      channelConfig: { allowed: true, users: ["42"] },
      guildInfo: { users: ["7"] },
      memberRoleIds: [],
      sender,
    });
    expect(state.channelUsers).toEqual(["42"]);
    expect(state.hasAccessRestrictions).toBe(true);
    expect(state.memberAllowed).toBe(true);
  });

  it("falls back to guild-level lists and denies non-members", () => {
    const state = resolveDiscordMemberAccessState({
      guildInfo: { users: ["7"] },
      memberRoleIds: [],
      sender,
    });
    expect(state.channelUsers).toEqual(["7"]);
    expect(state.hasAccessRestrictions).toBe(true);
    expect(state.memberAllowed).toBe(false);
  });

  it("allows a member through a role even if the user list does not include them", () => {
    const state = resolveDiscordMemberAccessState({
      channelConfig: { allowed: true, users: ["7"], roles: ["100"] },
      memberRoleIds: ["100"],
      sender,
    });
    expect(state.memberAllowed).toBe(true);
  });
});

describe("resolveDiscordOwnerAllowFrom", () => {
  const sender = { id: "42", name: "Alice", tag: "alice#1" };

  it("returns undefined without a usable user list", () => {
    expect(resolveDiscordOwnerAllowFrom({ sender })).toBeUndefined();
    expect(
      resolveDiscordOwnerAllowFrom({ channelConfig: { allowed: true, users: [] }, sender }),
    ).toBe(undefined);
  });

  it("returns the matched id for a direct match", () => {
    expect(
      resolveDiscordOwnerAllowFrom({
        channelConfig: { allowed: true, users: ["user:42"] },
        sender,
      }),
    ).toEqual(["42"]);
  });

  it("does not expose the wildcard as an owner and ignores non-matching senders", () => {
    expect(
      resolveDiscordOwnerAllowFrom({ channelConfig: { allowed: true, users: ["*"] }, sender }),
    ).toBeUndefined();
    expect(resolveDiscordOwnerAllowFrom({ guildInfo: { users: ["99"] }, sender })).toBeUndefined();
  });

  it("matches by name only when name matching is enabled", () => {
    const params = { guildInfo: { users: ["alice"] }, sender };
    expect(resolveDiscordOwnerAllowFrom(params)).toBeUndefined();
    expect(resolveDiscordOwnerAllowFrom({ ...params, allowNameMatching: true })).toEqual(["alice"]);
  });
});

describe("resolveDiscordOwnerAccess", () => {
  const sender = { id: "42" };

  it("denies owner access when no allowFrom list is configured", () => {
    expect(resolveDiscordOwnerAccess({ sender })).toEqual({
      ownerAllowList: null,
      ownerAllowed: false,
    });
  });

  it("allows owners matched by prefixed id and denies others", () => {
    expect(resolveDiscordOwnerAccess({ allowFrom: ["discord:42"], sender }).ownerAllowed).toBe(
      true,
    );
    expect(resolveDiscordOwnerAccess({ allowFrom: ["discord:43"], sender }).ownerAllowed).toBe(
      false,
    );
  });

  it("treats a wildcard allowFrom as matching every sender", () => {
    expect(resolveDiscordOwnerAccess({ allowFrom: ["*"], sender }).ownerAllowed).toBe(true);
  });
});
