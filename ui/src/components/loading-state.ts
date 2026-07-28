import { html } from "lit";
import { t } from "../i18n/index.ts";
import "./bot-mascot.ts";

export function renderLoadingState() {
  return html`
    <section
      class="lazy-view-state lazy-view-state--loading"
      role="status"
      aria-live="polite"
      aria-label=${t("common.loading")}
    >
      <bot-mascot mood="thinking" .size=${120}></bot-mascot>
    </section>
  `;
}
