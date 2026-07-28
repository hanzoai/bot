import { BotTerminalPanel } from "./terminal-panel.ts";

// Guarded define so shared registries can retain this module across reloads.
if (!customElements.get("bot-terminal-panel")) {
  customElements.define("bot-terminal-panel", BotTerminalPanel);
}
