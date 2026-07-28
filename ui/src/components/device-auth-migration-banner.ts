// Upgrade-only banner keeps migration presentation off the ordinary startup path.
import { html, nothing } from "lit";
import { property } from "lit/decorators.js";
import { t } from "../i18n/index.ts";
import { BotLightDomContentsElement } from "../lit/bot-element.ts";
import "./update-banner.ts";

type DeviceAuthMigrationBannerProps = {
  state: { requestId: string | null; busy: boolean; error: string | null };
  onSecure: () => void;
};

class DeviceAuthMigrationBanner extends BotLightDomContentsElement {
  @property({ attribute: false }) props?: DeviceAuthMigrationBannerProps;

  override render() {
    const props = this.props;
    if (!props) {
      return nothing;
    }
    return html`<bot-update-banner
      .props=${{
        statusBanner: {
          tone: props.state.error ? "danger" : "warn",
          text: props.state.error ?? t("login.deviceAuthMigration.banner"),
        },
        action:
          props.state.requestId && !props.state.busy
            ? { label: t("login.deviceAuthMigration.action"), onClick: props.onSecure }
            : undefined,
      }}
    ></bot-update-banner>`;
  }
}

if (!customElements.get("bot-device-auth-migration-banner")) {
  customElements.define("bot-device-auth-migration-banner", DeviceAuthMigrationBanner);
}
