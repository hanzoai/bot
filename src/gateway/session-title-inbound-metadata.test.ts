import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { useAutoCleanupTempDirTracker } from "../../test/helpers/temp-dir.js";
import { markInboundContextLabel } from "../auto-reply/reply/inbound-context-marker.js";
import type { SessionEntry } from "../config/sessions.js";
import { persistSessionTranscriptTurn } from "../config/sessions/session-accessor.js";
import { closeBotAgentDatabasesForTest } from "../state/bot-agent-db.js";
import { closeBotStateDatabaseForTest } from "../state/bot-state-db.js";
import { captureEnv, setTestEnvValue } from "../test-utils/env.js";
import {
  readSessionTitleFieldsFromTranscript,
  readSessionTitleFieldsFromTranscriptAsync,
} from "./session-transcript-title-reader.js";
import { deriveSessionTitle } from "./session-utils-core.js";

const tempDirs = useAutoCleanupTempDirTracker(afterEach);

const senderMetadata = `${markInboundContextLabel("Sender:")}
\`\`\`json
{"label":"bot-tui (gateway-client)","id":"gateway-client"}
\`\`\``;

describe("session titles with inbound Gateway metadata", () => {
  let tempDir: string;
  let envSnapshot: ReturnType<typeof captureEnv>;

  beforeEach(() => {
    envSnapshot = captureEnv(["BOT_STATE_DIR"]);
    tempDir = tempDirs.make("bot-session-title-inbound-");
    setTestEnvValue("BOT_STATE_DIR", tempDir);
  });

  afterEach(() => {
    closeBotAgentDatabasesForTest();
    closeBotStateDatabaseForTest();
    envSnapshot.restore();
  });

  test.each([
    { backend: "sqlite", content: "string" },
    { backend: "sqlite", content: "text blocks" },
  ] as const)(
    "uses the user message, not metadata, for $backend $content transcripts",
    async ({ backend, content }) => {
      const sessionId = `session-title-${backend}-${content.replaceAll(" ", "-")}`;
      const messageText = `${senderMetadata}\n\nHelp me investigate the flaky deployment`;
      const userContent =
        content === "string" ? messageText : [{ type: "text" as const, text: messageText }];
      const messages = [
        { message: { role: "user" as const, content: userContent } },
        { message: { role: "assistant" as const, content: "Here is the deployment status." } },
      ];
      const scope = {
        agentId: "main",
        sessionId,
        sessionKey: `agent:main:${sessionId}`,
        storePath: path.join(tempDir, "sessions.json"),
      };
      await persistSessionTranscriptTurn(scope, {
        cwd: tempDir,
        messages,
        touchSessionEntry: false,
      });

      const entry: SessionEntry = { sessionId, updatedAt: 0 };
      const syncFields = readSessionTitleFieldsFromTranscript(scope);
      const asyncFields = await readSessionTitleFieldsFromTranscriptAsync(scope);

      expect(asyncFields).toEqual(syncFields);
      expect(deriveSessionTitle(entry, syncFields.firstUserMessage)).toBe(
        "Help me investigate the flaky deployment",
      );
      expect(syncFields.lastMessagePreview).toBe("Here is the deployment status.");
    },
  );

  test("falls back to the session id when the first message contains only metadata", () => {
    const entry: SessionEntry = { sessionId: "abcd1234-rest-of-session", updatedAt: 0 };

    expect(deriveSessionTitle(entry, senderMetadata)).toBe("abcd1234");
  });

  test("preserves unmarked sender-like user text", () => {
    const entry: SessionEntry = { sessionId: "abcd1234-rest-of-session", updatedAt: 0 };

    expect(deriveSessionTitle(entry, "Sender: help me debug the gateway")).toBe(
      "Sender: help me debug the gateway",
    );
  });

  test("keeps explicit session names ahead of user-message metadata", () => {
    const entry: SessionEntry = {
      sessionId: "abcd1234-rest-of-session",
      updatedAt: 0,
      displayName: "Deployment investigation",
    };

    expect(deriveSessionTitle(entry, senderMetadata)).toBe("Deployment investigation");
  });

  test("prefers the computed Gateway display name over transcript metadata", () => {
    const entry: SessionEntry = { sessionId: "abcd1234-rest-of-session", updatedAt: 0 };

    expect(
      deriveSessionTitle(
        entry,
        `${senderMetadata}\n\nHelp me investigate the flaky deployment`,
        "  bot-tui  ",
      ),
    ).toBe("bot-tui");
  });

  test("keeps a user-assigned session label ahead of the Gateway display name", () => {
    const entry: SessionEntry = {
      sessionId: "abcd1234-rest-of-session",
      updatedAt: 0,
      label: "Deployment investigation",
    };

    expect(deriveSessionTitle(entry, senderMetadata, "bot-tui")).toBe(
      "Deployment investigation",
    );
  });
});
