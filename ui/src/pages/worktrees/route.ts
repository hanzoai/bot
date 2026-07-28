import { definePage } from "@openclaw/uirouter";
import { html } from "lit";

export const page = definePage({
  id: "worktrees",
  path: "/worktrees",
  aliases: ["/settings/worktrees"],
  component: () =>
    import("./worktrees-page.ts").then(() => ({
      header: true,
      render: () => html`<bot-worktrees-page></bot-worktrees-page>`,
    })),
});
