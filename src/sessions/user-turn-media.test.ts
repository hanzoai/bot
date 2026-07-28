import { describe, expect, it } from "vitest";
import { hasPersistedMedia } from "./user-turn-media.js";

describe("hasPersistedMedia", () => {
  it.each([
    ["facts-only", { __bot: { media: [{ path: "/media/fact.png" }] } }],
    [
      "both-equal",
      { MediaPath: "/media/equal.png", __bot: { media: [{ path: "/media/equal.png" }] } },
    ],
    [
      "both-conflict",
      {
        MediaPath: "/media/legacy.png",
        __bot: { media: [{ path: "/media/canonical.png" }] },
      },
    ],
    ["sparse", { __bot: { media: [{}, { path: "/media/sparse.png" }] } }],
    ["type-only", { __bot: { media: [{ contentType: "image/png" }] } }],
    ["media-only", { role: "user", content: "", __bot: { media: [{ kind: "image" }] } }],
  ])("recognizes $0 persisted rows", (_name, message) => {
    expect(hasPersistedMedia(message)).toBe(true);
  });

  it("rejects empty and alignment-only rows", () => {
    expect(hasPersistedMedia({ MediaPath: "/media/legacy.png" })).toBe(false);
    expect(hasPersistedMedia({ role: "user", content: "" })).toBe(false);
    expect(hasPersistedMedia({ __bot: { media: [{}] } })).toBe(false);
  });
});
