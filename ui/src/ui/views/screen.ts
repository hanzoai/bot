import { html } from "lit";
import { t } from "../../i18n/index.ts";

export type ScreenProps = {
  connected: boolean;
  gatewayUrl: string;
};

/**
 * Resolves the VNC viewer URL from the gateway WebSocket URL.
 * Converts ws:// → http:// or wss:// → https:// and appends /vnc-viewer.
 */
function resolveVncViewerUrl(gatewayUrl: string): string {
  const trimmed = gatewayUrl.trim();
  if (!trimmed) {
    return "/vnc-viewer";
  }
  const httpUrl = trimmed.replace(/^wss:\/\//i, "https://").replace(/^ws:\/\//i, "http://");
  const base = httpUrl.replace(/\/+$/, "");
  return `${base}/vnc-viewer`;
}

export function renderScreen(props: ScreenProps) {
  if (!props.connected) {
    return html`
      <div class="callout" style="margin-top: 16px;">
        ${t("screen.disconnected")}
      </div>
    `;
  }

  const viewerUrl = resolveVncViewerUrl(props.gatewayUrl);

  return html`
    <section style="display: flex; flex-direction: column; height: calc(100vh - 120px); gap: 12px;">
      <div class="row" style="gap: 8px; align-items: center; flex-shrink: 0;">
        <a
          class="btn btn--outline"
          href=${viewerUrl}
          target="_blank"
          rel="noreferrer"
          title="${t("screen.openNewTab")}"
        >${t("screen.openNewTab")}</a>
        <span class="muted">${t("screen.hint")}</span>
      </div>
      <iframe
        src=${viewerUrl}
        style="flex: 1; width: 100%; border: 1px solid var(--border, #333); border-radius: 8px; background: #0a0a0a;"
        allow="clipboard-read; clipboard-write"
        title="Remote Desktop"
      ></iframe>
    </section>
  `;
}
