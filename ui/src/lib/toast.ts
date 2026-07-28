import { html, nothing } from "lit";
import { state } from "lit/decorators.js";
import { t } from "../i18n/index.ts";
import { BotLightDomContentsElement } from "../lit/bot-element.ts";

type ToastOptions = {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  durationMs?: number;
};

const DEFAULT_TOAST_DURATION_MS = 6_000;

class BotToastHost extends BotLightDomContentsElement {
  @state() private toast: ToastOptions | null = null;
  private dismissTimer: ReturnType<typeof globalThis.setTimeout> | null = null;

  override disconnectedCallback() {
    this.clearDismissTimer();
    super.disconnectedCallback();
  }

  show(options: ToastOptions) {
    this.clearDismissTimer();
    this.toast = options;
    this.dismissTimer = globalThis.setTimeout(
      () => this.dismiss(),
      options.durationMs ?? DEFAULT_TOAST_DURATION_MS,
    );
  }

  private clearDismissTimer() {
    if (this.dismissTimer !== null) {
      globalThis.clearTimeout(this.dismissTimer);
      this.dismissTimer = null;
    }
  }

  private dismiss() {
    this.clearDismissTimer();
    this.toast = null;
  }

  override render() {
    const toast = this.toast;
    if (!toast) {
      return nothing;
    }
    return html`
      <div class="app-toast" role="status" aria-live="polite" aria-atomic="true">
        <span class="app-toast__message">${toast.message}</span>
        ${toast.actionLabel && toast.onAction
          ? html`
              <button
                type="button"
                class="app-toast__action"
                @click=${() => {
                  this.dismiss();
                  toast.onAction?.();
                }}
              >
                ${toast.actionLabel}
              </button>
            `
          : nothing}
        <button
          type="button"
          class="app-toast__dismiss"
          aria-label=${t("common.dismiss")}
          @click=${() => this.dismiss()}
        >
          ×
        </button>
      </div>
    `;
  }
}

export function showToast(options: ToastOptions): void {
  document.querySelector<BotToastHost>("bot-toast-host")?.show(options);
}

if (!customElements.get("bot-toast-host")) {
  customElements.define("bot-toast-host", BotToastHost);
}

declare global {
  interface HTMLElementTagNameMap {
    "bot-toast-host": BotToastHost;
  }
}
