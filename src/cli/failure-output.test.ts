// Failure output tests cover CLI error formatting and failure summaries.
import { describe, expect, it } from "vitest";
import { formatCliFailureLines } from "./failure-output.js";

describe("formatCliFailureLines", () => {
  it("shows a concise reason and recovery commands by default", () => {
    const lines = formatCliFailureLines({
      title: "Could not start the CLI.",
      error: new Error("config file is invalid"),
      argv: ["node", "bot", "status"],
      env: {},
    });

    expect(lines).toEqual([
      "[bot] Could not start the CLI.",
      "[bot] Reason: config file is invalid",
      "[bot] Debug: set BOT_DEBUG=1 to include the stack trace.",
      "[bot] Try: bot doctor",
      "[bot] Help: bot --help",
    ]);
  });

  it("prints stack details when debug output is requested", () => {
    const lines = formatCliFailureLines({
      title: "The CLI command failed.",
      error: new Error("boom"),
      env: { BOT_DEBUG: "1" },
    });

    expect(lines.slice(0, 4)).toEqual([
      "[bot] The CLI command failed.",
      "[bot] Reason: boom",
      "[bot] Stack:",
      "[bot] Error: boom",
    ]);
    expect(lines.join("\n")).toContain("Error: boom");
  });
});
