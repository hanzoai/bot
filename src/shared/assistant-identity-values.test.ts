import { describe, expect, it } from "vitest";
import { coerceIdentityValue } from "./assistant-identity-values.js";

describe("shared/assistant-identity-values", () => {
  it("returns undefined for missing or blank values", () => {
    expect(coerceIdentityValue(undefined, 10)).toBeUndefined();
    expect(coerceIdentityValue("   ", 10)).toBeUndefined();
    expect(coerceIdentityValue(42 as unknown as string, 10)).toBeUndefined();
  });

  it("trims values and preserves strings within the limit", () => {
    expect(coerceIdentityValue("  Hanzo Bot  ", 20)).toBe("Hanzo Bot");
    expect(coerceIdentityValue("  Hanzo Bot  ", 8)).toBe("Hanzo Bot");
  });

  it("truncates overlong trimmed values at the exact limit", () => {
    expect(coerceIdentityValue("  Hanzo Bot Assistant  ", 8)).toBe("Hanzo Bot");
  });

  it("returns an empty string when truncating to a zero-length limit", () => {
    expect(coerceIdentityValue("  Hanzo Bot  ", 0)).toBe("");
    expect(coerceIdentityValue("  Hanzo Bot  ", -1)).toBe("OpenCla");
  });
});
