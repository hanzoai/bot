import type { AgentSession } from "@mariozechner/pi-coding-agent";

export function replaceAgentMessagesCompat(
  agent: AgentSession["agent"],
  messages: AgentSession["messages"],
) {
  const compat = agent as unknown as {
    replaceMessages?: (next: AgentSession["messages"]) => void;
    state?: { messages: AgentSession["messages"] };
  };
  if (typeof compat.replaceMessages === "function") {
    compat.replaceMessages(messages);
    return;
  }
  if (compat.state) {
    compat.state.messages = [...messages];
  }
}
