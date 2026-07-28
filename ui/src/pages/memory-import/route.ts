import { definePage } from "@openclaw/uirouter";
import { html } from "lit";

export const page = definePage({
  id: "memory-import",
  path: "/memory-import",
  aliases: ["/settings/memory-import"],
  component: () =>
    import("./memory-import-page.ts").then(() => ({
      header: true,
      render: () => html`<bot-memory-import-page></bot-memory-import-page>`,
    })),
});
