type BotCodingToolsFactory =
  (typeof import("bot/plugin-sdk/agent-harness"))["createBotCodingTools"];

/** Mutable dependency seam shared by dynamic-tool construction and its behavioral tests. */
export const dynamicToolBuildState: {
  botCodingToolsFactory?: BotCodingToolsFactory;
} = {};
