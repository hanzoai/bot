import { definePage } from "@openclaw/uirouter";
import { html } from "lit";

export const page = definePage({
  id: "apps",
  path: "/apps",
  component: () =>
    import("./apps-page.ts").then(() => ({
      header: true,
      render: () => html`<bot-apps-page></bot-apps-page>`,
    })),
});
