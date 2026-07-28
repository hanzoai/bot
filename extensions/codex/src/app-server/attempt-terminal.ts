import {
  agentHarnessAttemptTerminal,
  type AgentHarnessAttemptResult,
} from "bot/plugin-sdk/agent-harness-runtime";

export type EmbeddedRunAttemptResult = Extract<AgentHarnessAttemptResult, { terminal: unknown }>;
export type AttemptFailureSource = Extract<
  EmbeddedRunAttemptResult["terminal"],
  { kind: "failed" }
>["source"];
export const attemptTerminal = agentHarnessAttemptTerminal;
