import { html } from "lit";
import { t } from "../../i18n/index.ts";
import type { AppViewState } from "../app-view-state.ts";
import { icons } from "../icons.ts";
import { normalizeBasePath } from "../navigation.ts";
import { agentLogoUrl } from "./agents-utils.ts";

const HANZO_IAM_BASE = "https://hanzo.id";
const HANZO_IAM_CLIENT_ID = "hanzo-bot";

function buildHanzoOAuthUrl(mode: "login" | "signup" = "login"): string {
  const redirectUri = `${window.location.origin}/oauth-callback`;
  const params = new URLSearchParams({
    client_id: HANZO_IAM_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
  });
  if (mode === "signup") {
    return `${HANZO_IAM_BASE}/signup?${params.toString()}`;
  }
  return `${HANZO_IAM_BASE}/oauth/authorize?${params.toString()}`;
}

let showSelfHosted = false;

const iconMultiChannel = html`
  <svg
    width="20"
    height="20"
    viewBox="0 0 20 20"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <rect x="2" y="2" width="7" height="7" rx="1.5" />
    <rect x="11" y="2" width="7" height="7" rx="1.5" />
    <rect x="2" y="11" width="7" height="7" rx="1.5" />
    <rect x="11" y="11" width="7" height="7" rx="1.5" />
  </svg>
`;

const iconAIPowered = html`
  <svg
    width="20"
    height="20"
    viewBox="0 0 20 20"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path d="M10 1l1.5 4.5L16 7l-4.5 1.5L10 13l-1.5-4.5L4 7l4.5-1.5z" />
    <path d="M15 12l.75 2.25L18 15l-2.25.75L15 18l-.75-2.25L12 15l2.25-.75z" />
    <path d="M5 14l.5 1.5L7 16l-1.5.5L5 18l-.5-1.5L3 16l1.5-.5z" />
  </svg>
`;

const iconProductionReady = html`
  <svg
    width="20"
    height="20"
    viewBox="0 0 20 20"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path d="M10 2L3 6v6c0 4 3.5 6.5 7 8 3.5-1.5 7-4 7-8V6l-7-4z" />
    <path d="M7.5 10l2 2 3.5-3.5" />
  </svg>
`;

export function renderLoginGate(state: AppViewState) {
  const basePath = normalizeBasePath(state.basePath ?? "");
  const faviconSrc = agentLogoUrl(basePath);

  const oauthLoginUrl = buildHanzoOAuthUrl("login");
  const oauthSignupUrl = buildHanzoOAuthUrl("signup");

  const selfHostedSection = showSelfHosted
    ? html`
        <div class="landing__self-hosted">
          <div class="landing__self-hosted-card">
            <div class="landing__self-hosted-title">Connect to Self-Hosted Gateway</div>
            <div class="login-gate__form">
              <label class="field">
                <span>${t("overview.access.wsUrl")}</span>
                <input
                  .value=${state.settings.gatewayUrl}
                  @input=${(e: Event) => {
                    const v = (e.target as HTMLInputElement).value;
                    state.applySettings({ ...state.settings, gatewayUrl: v });
                  }}
                  placeholder="ws://127.0.0.1:18789"
                />
              </label>
              <label class="field">
                <span>${t("overview.access.token")}</span>
                <div class="login-gate__secret-row">
                  <input
                    type=${state.loginShowGatewayToken ? "text" : "password"}
                    autocomplete="off"
                    spellcheck="false"
                    .value=${state.settings.token}
                    @input=${(e: Event) => {
                      const v = (e.target as HTMLInputElement).value;
                      state.applySettings({ ...state.settings, token: v });
                    }}
                    placeholder="BOT_GATEWAY_TOKEN (${t("login.passwordPlaceholder")})"
                    @keydown=${(e: KeyboardEvent) => {
                      if (e.key === "Enter") {
                        state.connect();
                      }
                    }}
                  />
                  <button
                    type="button"
                    class="btn btn--icon ${state.loginShowGatewayToken ? "active" : ""}"
                    title=${state.loginShowGatewayToken ? "Hide token" : "Show token"}
                    aria-label="Toggle token visibility"
                    aria-pressed=${state.loginShowGatewayToken}
                    @click=${() => {
                      state.loginShowGatewayToken = !state.loginShowGatewayToken;
                    }}
                  >
                    ${state.loginShowGatewayToken ? icons.eye : icons.eyeOff}
                  </button>
                </div>
              </label>
              <label class="field">
                <span>${t("overview.access.password")}</span>
                <div class="login-gate__secret-row">
                  <input
                    type=${state.loginShowGatewayPassword ? "text" : "password"}
                    autocomplete="off"
                    spellcheck="false"
                    .value=${state.password}
                    @input=${(e: Event) => {
                      const v = (e.target as HTMLInputElement).value;
                      state.password = v;
                    }}
                    placeholder="${t("login.passwordPlaceholder")}"
                    @keydown=${(e: KeyboardEvent) => {
                      if (e.key === "Enter") {
                        state.connect();
                      }
                    }}
                  />
                  <button
                    type="button"
                    class="btn btn--icon ${state.loginShowGatewayPassword ? "active" : ""}"
                    title=${state.loginShowGatewayPassword ? "Hide password" : "Show password"}
                    aria-label="Toggle password visibility"
                    aria-pressed=${state.loginShowGatewayPassword}
                    @click=${() => {
                      state.loginShowGatewayPassword = !state.loginShowGatewayPassword;
                    }}
                  >
                    ${state.loginShowGatewayPassword ? icons.eye : icons.eyeOff}
                  </button>
                </div>
              </label>
              <button
                class="btn primary login-gate__connect"
                @click=${() => state.connect()}
              >
                ${t("common.connect")}
              </button>
            </div>
          </div>
        </div>
      `
    : "";

  return html`
    <div class="landing">
      <!-- Nav bar -->
      <nav class="landing__nav">
        <a class="landing__nav-brand" href="/">
          <img src=${faviconSrc} alt="" />
          <span>Hanzo Bot</span>
        </a>
        <div class="landing__nav-actions">
          <a class="landing__nav-link" href=${oauthLoginUrl}>Sign In</a>
          <a class="landing__nav-btn" href=${oauthSignupUrl}>Sign Up</a>
        </div>
      </nav>

      <!-- Hero section -->
      <section class="landing__hero">
        <h1 class="landing__hero-title">All your agents in one place</h1>
        <p class="landing__hero-sub">
          Deploy, manage, and monitor AI agents across every channel.
          One dashboard to rule them all.
        </p>
        <a class="landing__cta" href=${oauthSignupUrl}>Launch Bot</a>
        <button
          class="landing__cta-secondary"
          type="button"
          @click=${() => {
            showSelfHosted = !showSelfHosted;
            (state as unknown as { requestUpdate: () => void }).requestUpdate();
          }}
        >
          ${showSelfHosted ? "hide self-hosted gateway" : "or connect to self-hosted gateway"}
        </button>
      </section>

      <!-- Features grid -->
      <section class="landing__features">
        <div class="landing__feature-card">
          <div class="landing__feature-icon">${iconMultiChannel}</div>
          <div class="landing__feature-title">Multi-Channel</div>
          <div class="landing__feature-desc">
            Connect to Telegram, Discord, Slack, WhatsApp, and more from a single dashboard.
          </div>
        </div>
        <div class="landing__feature-card">
          <div class="landing__feature-icon">${iconAIPowered}</div>
          <div class="landing__feature-title">AI-Powered</div>
          <div class="landing__feature-desc">
            Built-in support for Claude, GPT, and custom models with intelligent routing.
          </div>
        </div>
        <div class="landing__feature-card">
          <div class="landing__feature-icon">${iconProductionReady}</div>
          <div class="landing__feature-title">Production Ready</div>
          <div class="landing__feature-desc">
            Enterprise-grade security, monitoring, and usage analytics out of the box.
          </div>
        </div>
      </section>

      <!-- Self-hosted connect (toggled) -->
      ${selfHostedSection}

      <!-- Error callout -->
      ${
        state.lastError
          ? html`<div class="landing__self-hosted">
              <div class="callout danger">${state.lastError}</div>
            </div>`
          : ""
      }

      <!-- Footer -->
      <footer class="landing__footer">
        Powered by Hanzo
        <span style="margin: 0 8px;">|</span>
        <a href="https://docs.hanzo.bot" target="_blank" rel="noreferrer">Docs</a>
        <span style="margin: 0 8px;">|</span>
        <a href="${HANZO_IAM_BASE}/signup" target="_blank" rel="noreferrer">Sign Up</a>
      </footer>
    </div>
  `;
}
