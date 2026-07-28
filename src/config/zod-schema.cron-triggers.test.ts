import { describe, expect, it } from "vitest";
import { BotSchema } from "./zod-schema.js";

describe("BotSchema cron triggers", () => {
  it("accepts the strict trigger gate", () => {
    expect(BotSchema.parse({ cron: { triggers: { enabled: true } } }).cron?.triggers).toEqual({
      enabled: true,
    });
  });

  it("rejects invalid and unknown trigger settings", () => {
    expect(
      BotSchema.safeParse({ cron: { triggers: { enabled: true, extra: true } } }).success,
    ).toBe(false);
  });
});
