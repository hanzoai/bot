import { AgentSelect } from "./agent-select.ts";

if (!customElements.get("bot-agent-select")) {
  customElements.define("bot-agent-select", AgentSelect);
}
