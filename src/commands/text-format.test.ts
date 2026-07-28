// Text format tests cover command-facing shortening helpers.
import { describe, expect, it } from "vitest";
import { shortenText } from "./text-format.js";

describe("shortenText", () => {
  it("returns original text when it fits", () => {
    expect(shortenText("bot", 16)).toBe("bot");
  });

  it("truncates and appends ellipsis when over limit", () => {
    expect(shortenText("bot-status-output", 10)).toBe("bot-…");
  });

  it("returns an empty string for non-positive limits", () => {
    expect(shortenText("bot", 0)).toBe("");
    expect(shortenText("bot", -1)).toBe("");
  });

  it("counts multi-byte characters correctly", () => {
    expect(shortenText("hello🙂world", 7)).toBe("hello🙂…");
  });
});
