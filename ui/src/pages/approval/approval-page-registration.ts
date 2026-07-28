import { ApprovalPage } from "./approval-page.ts";

if (!customElements.get("bot-approval-page")) {
  customElements.define("bot-approval-page", ApprovalPage);
}
