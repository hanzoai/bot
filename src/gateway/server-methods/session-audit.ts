import { SessionManager } from "../../agents/sessions/session-manager.js";
import type { SessionEntry } from "../../config/sessions.js";
import type { BotConfig } from "../../config/types.bot.js";

export async function appendSessionAudit(params: {
  cfg: BotConfig;
  target: {
    agentId: string;
    entry: Pick<SessionEntry, "sessionId">;
    sessionKey: string;
    storePath: string;
  };
  text: string;
  now: number;
}): Promise<void> {
  const identity = {
    agentId: params.target.agentId,
    sessionId: params.target.entry.sessionId,
    storePath: params.target.storePath,
  };
  SessionManager.open({ ...identity, sessionKey: params.target.sessionKey }).appendMessage(
    {
      role: "custom",
      customType: "bot.system-note",
      content: `System note: ${params.text}`,
      display: true,
      timestamp: params.now,
    },
    { config: params.cfg },
  );
}
