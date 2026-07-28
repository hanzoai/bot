// Error output tests cover program-level error display and exit messaging.
import { describe, expect, it } from "vitest";
import { formatCliParseErrorOutput } from "./error-output.js";

describe("formatCliParseErrorOutput", () => {
  it("explains unknown commands with root help and plugin hints", () => {
    const output = formatCliParseErrorOutput("error: unknown command 'wat'\n", {
      argv: ["node", "bot", "wat"],
    });

    expect(output).toBe(
      'Bot does not know the command "wat".\nTry: bot --help\nPlugin command? bot plugins list\nDocs: https://docs.bot.ai/cli\n',
    );
  });

  it("suggests close known commands for unknown commands", () => {
    const output = formatCliParseErrorOutput("error: unknown command 'upate'\n", {
      argv: ["node", "bot", "upate"],
    });

    expect(output).toBe(
      'Bot does not know the command "upate".\nDid you mean this?\n  bot update\nTry: bot --help\nPlugin command? bot plugins list\nDocs: https://docs.bot.ai/cli\n',
    );
  });

  it("suggests explicit aliases for common adjacent terminology", () => {
    const output = formatCliParseErrorOutput("error: unknown command 'upgrade'\n", {
      argv: ["node", "bot", "upgrade"],
    });

    expect(output).toContain("Did you mean this?\n  bot update\n");
  });

  it("preserves active profile context in command suggestions", () => {
    const originalProfile = process.env.BOT_PROFILE;
    process.env.BOT_PROFILE = "work";
    try {
      const output = formatCliParseErrorOutput("error: unknown command 'doctr'\n", {
        argv: ["node", "bot", "doctr"],
      });

      expect(output).toContain("Did you mean this?\n  bot --profile work doctor\n");
    } finally {
      if (originalProfile === undefined) {
        delete process.env.BOT_PROFILE;
      } else {
        process.env.BOT_PROFILE = originalProfile;
      }
    }
  });

  it("points unknown options at the active command help", () => {
    const output = formatCliParseErrorOutput("error: unknown option '--wat'\n", {
      argv: ["node", "bot", "channels", "status", "--wat"],
    });

    expect(output).toBe(
      'Bot does not recognize option "--wat".\nTry: bot channels status --help\n',
    );
  });

  it("points missing required arguments at command help", () => {
    const output = formatCliParseErrorOutput("error: missing required argument 'name'\n", {
      argv: ["node", "bot", "plugins", "install"],
    });

    expect(output).toBe(
      'Missing required argument "name".\nTry: bot plugins install --help\n',
    );
  });
});
