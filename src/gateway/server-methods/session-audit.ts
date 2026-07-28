import { SessionManager } from "../../agents/sessions/session-manager.js";
import type { SessionEntry } from "../../config/sessions.js";
import { formatSqliteSessionFileMarker } from "../../config/sessions/sqlite-marker.js";
import type { BotConfig } from "../../config/types.bot.js";

export async function appendSessionAudit(params: {
  cfg: BotConfig;
  target: {
    agentId: string;
    entry: Pick<SessionEntry, "sessionId">;
    storePath: string;
  };
  text: string;
  now: number;
}): Promise<void> {
  const sessionFile = formatSqliteSessionFileMarker({
    agentId: params.target.agentId,
    sessionId: params.target.entry.sessionId,
    storePath: params.target.storePath,
  });
  SessionManager.open(sessionFile).appendMessage(
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
