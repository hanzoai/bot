// Public custom-element entrypoint for the Control UI chat pane.
import { ChatPaneRender } from "./chat-pane-render.ts";

class ChatPane extends ChatPaneRender {}

if (!customElements.get("bot-chat-pane")) {
  customElements.define("bot-chat-pane", ChatPane);
}

declare global {
  interface HTMLElementTagNameMap {
    "bot-chat-pane": ChatPane;
  }
}
