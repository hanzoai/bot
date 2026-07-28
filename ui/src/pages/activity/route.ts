import { definePage } from "@openclaw/uirouter";
import { html } from "lit";

export const page = definePage({
  id: "activity",
  path: "/activity",
  component: () =>
    import("./activity-page.ts").then(() => ({
      header: true,
      render: () => html`<bot-activity-page></bot-activity-page>`,
    })),
});
