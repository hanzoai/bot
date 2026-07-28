// Launchd current service tests cover resolving active macOS service labels.
import { describe, expect, it } from "vitest";
import { isCurrentProcessLaunchdServiceLabel } from "./launchd-current-service.js";

describe("isCurrentProcessLaunchdServiceLabel", () => {
  it("matches launchd-provided service labels", () => {
    expect(
      isCurrentProcessLaunchdServiceLabel("ai.bot.gateway", {
        LAUNCH_JOB_LABEL: "ai.bot.gateway",
      }),
    ).toBe(true);
  });

  it("falls back to Bot service markers when XPC_SERVICE_NAME is inherited", () => {
    expect(
      isCurrentProcessLaunchdServiceLabel("ai.bot.gateway", {
        XPC_SERVICE_NAME: "0",
        BOT_SERVICE_MARKER: "bot",
        BOT_SERVICE_KIND: "gateway",
        BOT_LAUNCHD_LABEL: "ai.bot.gateway",
      }),
    ).toBe(true);
  });

  it("preserves label-only fallback when launchd exposes no label variables", () => {
    expect(
      isCurrentProcessLaunchdServiceLabel("ai.bot.gateway", {
        BOT_LAUNCHD_LABEL: "ai.bot.gateway",
      }),
    ).toBe(true);
  });

  it("can require service markers for label-only fallback", () => {
    expect(
      isCurrentProcessLaunchdServiceLabel(
        "ai.bot.gateway",
        {
          BOT_LAUNCHD_LABEL: "ai.bot.gateway",
        },
        { allowConfiguredLabelFallback: false },
      ),
    ).toBe(false);
  });

  it("does not treat unrelated inherited launchd labels as current services", () => {
    expect(
      isCurrentProcessLaunchdServiceLabel("ai.bot.gateway", {
        XPC_SERVICE_NAME: "0",
        BOT_LAUNCHD_LABEL: "ai.bot.gateway",
      }),
    ).toBe(false);
  });
});
