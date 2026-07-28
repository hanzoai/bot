import { GitHubLinkHovercardProvider } from "./github-link-hovercard.ts";

if (!customElements.get("bot-github-link-hovercard-provider")) {
  customElements.define("bot-github-link-hovercard-provider", GitHubLinkHovercardProvider);
}
