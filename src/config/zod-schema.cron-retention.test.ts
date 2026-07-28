// Verifies cron retention schema parsing and defaults.
import { describe, expect, it } from "vitest";
import { BotSchema } from "./zod-schema.js";

describe("BotSchema cron retention validation", () => {
  it("accepts valid cron.sessionRetention values", () => {
    const result = BotSchema.safeParse({
      cron: {
        sessionRetention: "1h30m",
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid cron.sessionRetention", () => {
    expect(() =>
      BotSchema.parse({
        cron: {
          sessionRetention: "abc",
        },
      }),
    ).toThrow(/sessionRetention|duration/i);
  });

  it("rejects retired cron.runLog config", () => {
    expect(() =>
      BotSchema.parse({
        cron: {
          runLog: { keepLines: 2000 },
        },
      }),
    ).toThrow(/runLog|unrecognized/i);
  });
});
