import { describe, expect, it } from "vitest";
import type { Hanzo BotConfig } from "../api.js";
import { tlonPlugin } from "./channel.js";

describe("tlonPlugin config", () => {
  it("formats dm allowlist entries through the shared hybrid adapter", () => {
    expect(
      tlonPlugin.config.formatAllowFrom?.({
        cfg: {} as Hanzo BotConfig,
        allowFrom: ["zod", " ~nec "],
      }),
    ).toEqual(["~zod", "~nec"]);
  });

  it("resolves dm allowlist from the default account", () => {
    expect(
      tlonPlugin.config.resolveAllowFrom?.({
        cfg: {
          channels: {
            tlon: {
              ship: "~sampel-palnet",
              url: "https://urbit.example.com",
              code: "lidlut-tabwed-pillex-ridrup",
              dmAllowlist: ["~zod"],
            },
          },
        } as Hanzo BotConfig,
        accountId: "default",
      }),
    ).toEqual(["~zod"]);
  });
});
