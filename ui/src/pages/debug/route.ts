import { definePage } from "@openclaw/uirouter";
import { html } from "lit";

export const page = definePage({
  id: "debug",
  path: "/debug",
  component: () =>
    import("./debug-page.ts").then(() => ({
      header: true,
      render: () => html`<bot-debug-page></bot-debug-page>`,
    })),
});
