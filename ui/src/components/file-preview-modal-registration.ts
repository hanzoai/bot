import { BotFilePreviewModal } from "./file-preview-modal.ts";

if (!customElements.get("bot-file-preview-modal")) {
  customElements.define("bot-file-preview-modal", BotFilePreviewModal);
}
