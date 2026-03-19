import { html, type TemplateResult } from "lit";
import type { AppViewState } from "../app-view-state.ts";
import { icons } from "../icons.ts";
import { normalizeBasePath } from "../navigation.ts";
import { agentLogoUrl } from "./agents-utils.ts";

const STORAGE_KEY = "hanzo.bot.site-lock.v1";

type StoredCredentials = {
  email: string;
  passwordHash: string;
};

function loadCredentials(): StoredCredentials | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "email" in parsed &&
      "passwordHash" in parsed &&
      typeof (parsed as StoredCredentials).email === "string" &&
      typeof (parsed as StoredCredentials).passwordHash === "string"
    ) {
      return parsed as StoredCredentials;
    }
    return null;
  } catch {
    return null;
  }
}

function saveCredentials(creds: StoredCredentials): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(creds));
  } catch {
    // best-effort
  }
}

function clearCredentials(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // best-effort
  }
}

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(digest);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Closure-based local state for the site lock form.
// These persist across re-renders but reset on full page reload.
let formEmail = "";
let formPassword = "";
let formConfirmPassword = "";
let formError = "";
let formShowPassword = false;
let formMode: "login" | "register" = loadCredentials() ? "login" : "register";

function resetFormState(): void {
  formEmail = "";
  formPassword = "";
  formConfirmPassword = "";
  formError = "";
  formShowPassword = false;
}

function handleReset(requestUpdate: () => void): void {
  clearCredentials();
  resetFormState();
  formMode = "register";
  requestUpdate();
}

function validateRegistration(): string | null {
  if (!formEmail.trim()) {
    return "Email is required.";
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formEmail.trim())) {
    return "Please enter a valid email address.";
  }
  if (formPassword.length < 8) {
    return "Password must be at least 8 characters.";
  }
  if (formPassword !== formConfirmPassword) {
    return "Passwords do not match.";
  }
  return null;
}

async function handleRegister(
  state: AppViewState,
  requestUpdate: () => void,
): Promise<void> {
  const validationError = validateRegistration();
  if (validationError) {
    formError = validationError;
    requestUpdate();
    return;
  }
  const passwordHash = await hashPassword(formPassword);
  saveCredentials({ email: formEmail.trim(), passwordHash });
  resetFormState();
  state.unlockSite();
}

async function handleLogin(
  state: AppViewState,
  stored: StoredCredentials,
  requestUpdate: () => void,
): Promise<void> {
  if (!formPassword) {
    formError = "Please enter your password.";
    requestUpdate();
    return;
  }
  const passwordHash = await hashPassword(formPassword);
  if (passwordHash !== stored.passwordHash) {
    formError = "Incorrect password.";
    formPassword = "";
    requestUpdate();
    return;
  }
  resetFormState();
  state.unlockSite();
}

function renderPasswordField(
  value: string,
  placeholder: string,
  onInput: (value: string) => void,
  onKeydown: (e: KeyboardEvent) => void,
  showPassword: boolean,
  onToggle: () => void,
): TemplateResult {
  return html`
    <div class="login-gate__secret-row">
      <input
        type=${showPassword ? "text" : "password"}
        autocomplete="off"
        spellcheck="false"
        .value=${value}
        @input=${(e: Event) => onInput((e.target as HTMLInputElement).value)}
        placeholder=${placeholder}
        @keydown=${onKeydown}
      />
      <button
        type="button"
        class="btn btn--icon ${showPassword ? "active" : ""}"
        title=${showPassword ? "Hide password" : "Show password"}
        aria-label="Toggle password visibility"
        aria-pressed=${showPassword}
        @click=${onToggle}
      >
        ${showPassword ? icons.eye : icons.eyeOff}
      </button>
    </div>
  `;
}

export function renderSiteLock(state: AppViewState): TemplateResult {
  const basePath = normalizeBasePath(state.basePath ?? "");
  const faviconSrc = agentLogoUrl(basePath);
  const stored = loadCredentials();

  // Sync mode with storage state on each render
  if (stored && formMode === "register") {
    formMode = "login";
    resetFormState();
  } else if (!stored && formMode === "login") {
    formMode = "register";
    resetFormState();
  }

  // Capture a requestUpdate callback so async handlers can trigger re-render.
  // The state object is the LitElement itself (cast to AppViewState), so
  // calling requestUpdate on it causes a Lit re-render cycle.
  const requestUpdate = () => {
    (state as unknown as { requestUpdate: () => void }).requestUpdate();
  };

  const errorBlock = formError
    ? html`<div class="callout danger" style="margin-top: 14px;">
        <div>${formError}</div>
      </div>`
    : "";

  if (formMode === "register") {
    return html`
      <div class="login-gate">
        <div class="login-gate__card">
          <div class="login-gate__header">
            <img class="login-gate__logo" src=${faviconSrc} alt="Hanzo Bot" />
            <div class="login-gate__title">Hanzo Bot</div>
            <div class="login-gate__sub">Create an account to get started</div>
          </div>
          <div class="login-gate__form">
            <label class="field">
              <span>Email</span>
              <input
                type="email"
                autocomplete="email"
                .value=${formEmail}
                @input=${(e: Event) => {
                  formEmail = (e.target as HTMLInputElement).value;
                  formError = "";
                  requestUpdate();
                }}
                placeholder="you@example.com"
                @keydown=${(e: KeyboardEvent) => {
                  if (e.key === "Enter") {
                    void handleRegister(state, requestUpdate);
                  }
                }}
              />
            </label>
            <label class="field">
              <span>Password</span>
              ${renderPasswordField(
                formPassword,
                "Minimum 8 characters",
                (v) => {
                  formPassword = v;
                  formError = "";
                  requestUpdate();
                },
                (e: KeyboardEvent) => {
                  if (e.key === "Enter") {
                    void handleRegister(state, requestUpdate);
                  }
                },
                formShowPassword,
                () => {
                  formShowPassword = !formShowPassword;
                  requestUpdate();
                },
              )}
            </label>
            <label class="field">
              <span>Confirm password</span>
              ${renderPasswordField(
                formConfirmPassword,
                "Re-enter your password",
                (v) => {
                  formConfirmPassword = v;
                  formError = "";
                  requestUpdate();
                },
                (e: KeyboardEvent) => {
                  if (e.key === "Enter") {
                    void handleRegister(state, requestUpdate);
                  }
                },
                formShowPassword,
                () => {
                  formShowPassword = !formShowPassword;
                  requestUpdate();
                },
              )}
            </label>
            <button
              class="btn primary login-gate__connect"
              @click=${() => void handleRegister(state, requestUpdate)}
            >
              Create Account
            </button>
          </div>
          ${errorBlock}
        </div>
      </div>
    `;
  }

  // Login mode — credentials exist
  const email = stored?.email ?? "";
  return html`
    <div class="login-gate">
      <div class="login-gate__card">
        <div class="login-gate__header">
          <img class="login-gate__logo" src=${faviconSrc} alt="Hanzo Bot" />
          <div class="login-gate__title">Hanzo Bot</div>
          <div class="login-gate__sub">Sign in to continue</div>
        </div>
        <div class="login-gate__form">
          <label class="field">
            <span>Email</span>
            <input type="email" .value=${email} readonly />
          </label>
          <label class="field">
            <span>Password</span>
            ${renderPasswordField(
              formPassword,
              "Enter your password",
              (v) => {
                formPassword = v;
                formError = "";
                requestUpdate();
              },
              (e: KeyboardEvent) => {
                if (e.key === "Enter" && stored) {
                  void handleLogin(state, stored, requestUpdate);
                }
              },
              formShowPassword,
              () => {
                formShowPassword = !formShowPassword;
                requestUpdate();
              },
            )}
          </label>
          <button
            class="btn primary login-gate__connect"
            @click=${() => {
              if (stored) {
                void handleLogin(state, stored, requestUpdate);
              }
            }}
          >
            Sign In
          </button>
        </div>
        ${errorBlock}
        <div
          style="text-align: center; margin-top: 16px; font-size: 13px; color: var(--muted);"
        >
          <a
            class="session-link"
            href="#"
            @click=${(e: Event) => {
              e.preventDefault();
              handleReset(requestUpdate);
            }}
          >
            Forgot password? Reset
          </a>
        </div>
      </div>
    </div>
  `;
}
