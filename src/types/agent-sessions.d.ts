// Declares extension points for agent session type augmentation.
export type BotAgentSessionSkillSourceAugmentation = never;

declare module "bot/plugin-sdk/agent-sessions" {
  interface Skill {
    // Bot relies on the source identifier returned by skill loaders.
    source: string;
  }
}
