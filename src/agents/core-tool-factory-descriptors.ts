/**
 * Static identity for names that select core agent factory families before assembly.
 */

export type CoreToolFactoryFamily = "base-coding" | "shell" | "bot";

type CoreToolFactoryDescriptor = {
  name: string;
  family: CoreToolFactoryFamily;
};

const CORE_TOOL_FACTORY_DESCRIPTORS = [
  { name: "edit", family: "base-coding" },
  { name: "read", family: "base-coding" },
  { name: "write", family: "base-coding" },
  { name: "apply_patch", family: "shell" },
  { name: "exec", family: "shell" },
  { name: "process", family: "shell" },
  { name: "agents_list", family: "bot" },
  // Static factory identity only; runtime and tools.catalog apply the Swarm config gate.
  { name: "agents_wait", family: "bot" },
  { name: "ask_user", family: "bot" },
  { name: "bot", family: "bot" },
  { name: "computer", family: "bot" },
  { name: "conversations_list", family: "bot" },
  { name: "conversations_send", family: "bot" },
  { name: "conversations_turn", family: "bot" },
  { name: "cron", family: "bot" },
  { name: "dashboard", family: "bot" },
  { name: "gateway", family: "bot" },
  { name: "get_goal", family: "bot" },
  { name: "heartbeat_respond", family: "bot" },
  { name: "image", family: "bot" },
  { name: "image_generate", family: "bot" },
  { name: "message", family: "bot" },
  { name: "mobile_ui", family: "bot" },
  { name: "music_generate", family: "bot" },
  { name: "nodes", family: "bot" },
  { name: "pdf", family: "bot" },
  { name: "session_status", family: "bot" },
  { name: "show_widget", family: "bot" },
  { name: "sessions", family: "bot" },
  { name: "sessions_history", family: "bot" },
  { name: "sessions_list", family: "bot" },
  { name: "sessions_search", family: "bot" },
  { name: "sessions_send", family: "bot" },
  { name: "sessions_spawn", family: "bot" },
  { name: "sessions_yield", family: "bot" },
  { name: "structured_output", family: "bot" },
  { name: "skill_workshop", family: "bot" },
  { name: "spawn_task", family: "bot" },
  { name: "create_goal", family: "bot" },
  { name: "subagents", family: "bot" },
  { name: "terminal", family: "bot" },
  { name: "transcripts", family: "bot" },
  { name: "tts", family: "bot" },
  { name: "update_goal", family: "bot" },
  { name: "update_plan", family: "bot" },
  { name: "dismiss_task", family: "bot" },
  { name: "video_generate", family: "bot" },
  { name: "web_fetch", family: "bot" },
  { name: "web_search", family: "bot" },
] as const satisfies readonly CoreToolFactoryDescriptor[];

const CORE_TOOL_FACTORY_FAMILY_BY_NAME = new Map<string, CoreToolFactoryFamily>(
  CORE_TOOL_FACTORY_DESCRIPTORS.map(({ name, family }) => [name, family]),
);

export type BotCodingToolConstructionPlan = {
  includeBaseCodingTools: boolean;
  includeShellTools: boolean;
  includeChannelTools: boolean;
  includeBotTools: boolean;
  includePluginTools: boolean;
};

export function resolveCoreToolFactoryFamily(name: string): CoreToolFactoryFamily | undefined {
  return CORE_TOOL_FACTORY_FAMILY_BY_NAME.get(name);
}

/**
 * Core coding primitives (file + shell families). Tool-search compaction keeps
 * these directly visible: hiding them behind search adds a lookup round-trip to
 * nearly every coding turn.
 */
export function isCoreCodingSurfaceToolName(name: string): boolean {
  const family = CORE_TOOL_FACTORY_FAMILY_BY_NAME.get(name);
  return family === "base-coding" || family === "shell";
}
