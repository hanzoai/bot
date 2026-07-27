import { describe, expect, it } from "vitest";
import { sharedSecretMatches } from "./bots-call-http.js";

// A match on this secret skips the IAM path entirely, so the comparison is the
// only thing standing in front of the bot-management tools.
const STRONG = "a".repeat(32);

describe("bots-call shared secret", () => {
  it("accepts the exact secret", () => {
    expect(sharedSecretMatches(STRONG, STRONG)).toBe(true);
  });

  it("rejects a wrong secret of the same length", () => {
    expect(sharedSecretMatches("b".repeat(32), STRONG)).toBe(false);
  });

  it("rejects a prefix, so a byte-at-a-time guess never gets partial credit", () => {
    expect(sharedSecretMatches("a".repeat(31), STRONG)).toBe(false);
    expect(sharedSecretMatches("a".repeat(33), STRONG)).toBe(false);
  });

  it("refuses a configured secret below the 32-byte floor, even when presented correctly", () => {
    const weak = "short-token";
    expect(sharedSecretMatches(weak, weak)).toBe(false);
  });

  it("refuses when either side is absent — an unset env must never authorize", () => {
    expect(sharedSecretMatches(undefined, STRONG)).toBe(false);
    expect(sharedSecretMatches(STRONG, undefined)).toBe(false);
    expect(sharedSecretMatches(undefined, undefined)).toBe(false);
    expect(sharedSecretMatches("", "")).toBe(false);
  });
});
