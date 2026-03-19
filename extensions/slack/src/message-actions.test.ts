import { describe, expect, it } from "vitest";
import type { HanzoBotConfig } from "../../../src/config/config.js";
import { listSlackMessageActions } from "./message-actions.js";

describe("listSlackMessageActions", () => {
  it("includes download-file when message actions are enabled", () => {
    const cfg = {
      channels: {
        slack: {
          botToken: "xoxb-test",
          actions: {
            messages: true,
          },
        },
      },
    } as HanzoBotConfig;

    expect(listSlackMessageActions(cfg)).toEqual(
      expect.arrayContaining(["read", "edit", "delete", "download-file"]),
    );
  });
});
