import type { ControlUiBootstrapIamConfig } from "../../../src/gateway/control-ui-contract.js";
import type { Tab } from "./navigation.ts";
import type { UiSettings } from "./storage.ts";
import { connectGateway } from "./app-gateway.ts";
import {
  startLogsPolling,
  startNodesPolling,
  stopLogsPolling,
  stopNodesPolling,
  startDebugPolling,
  stopDebugPolling,
} from "./app-polling.ts";
import { observeTopbar, scheduleChatScroll, scheduleLogsScroll } from "./app-scroll.ts";
import {
  applySettings,
  applySettingsFromUrl,
  attachThemeListener,
  detachThemeListener,
  inferBasePath,
  syncTabWithLocation,
  syncThemeWithSettings,
} from "./app-settings.ts";
import { loadControlUiBootstrapConfig } from "./controllers/control-ui-bootstrap.ts";
import { handleIamCallback, tryIamAutoLogin } from "./controllers/iam-auth.ts";

type LifecycleHost = {
  basePath: string;
  tab: Tab;
  assistantName: string;
  assistantAvatar: string | null;
  assistantAgentId: string | null;
  authMode: string | null;
  iamConfig: ControlUiBootstrapIamConfig | null;
  iamUser: { email?: string; name?: string; avatar?: string } | null;
  iamLoggingIn: boolean;
  settings: UiSettings;
  chatHasAutoScrolled: boolean;
  chatManualRefreshInFlight: boolean;
  chatLoading: boolean;
  chatMessages: unknown[];
  chatToolMessages: unknown[];
  chatStream: string;
  logsAutoFollow: boolean;
  logsAtBottom: boolean;
  logsEntries: unknown[];
  popStateHandler: () => void;
  postMessageHandler: ((event: MessageEvent) => void) | null;
  topbarObserver: ResizeObserver | null;
};

/** Trusted origins allowed to inject IAM tokens via postMessage. */
const TRUSTED_PARENT_ORIGINS = new Set([
  "https://app.hanzo.bot",
  "https://bot.hanzo.ai",
  "https://hanzo.app",
]);

export function handleConnected(host: LifecycleHost) {
  host.basePath = inferBasePath();
  applySettingsFromUrl(host as unknown as Parameters<typeof applySettingsFromUrl>[0]);
  syncTabWithLocation(host as unknown as Parameters<typeof syncTabWithLocation>[0], true);
  syncThemeWithSettings(host as unknown as Parameters<typeof syncThemeWithSettings>[0]);
  attachThemeListener(host as unknown as Parameters<typeof attachThemeListener>[0]);
  window.addEventListener("popstate", host.popStateHandler);

  // Listen for IAM token injection from parent frame (Playground embed)
  host.postMessageHandler = (event: MessageEvent) => {
    if (!TRUSTED_PARENT_ORIGINS.has(event.origin)) {
      return;
    }
    if (event.data?.type !== "hanzo:iam-token") {
      return;
    }
    const token = String(event.data.token ?? "").trim();
    if (!token) {
      return;
    }
    const settingsHost = host as unknown as Parameters<typeof applySettings>[0];
    if (token !== settingsHost.settings.token) {
      applySettings(settingsHost, { ...settingsHost.settings, token });
    }
  };
  window.addEventListener("message", host.postMessageHandler);

  void bootstrapAndConnect(host);
  startNodesPolling(host as unknown as Parameters<typeof startNodesPolling>[0]);
  if (host.tab === "logs") {
    startLogsPolling(host as unknown as Parameters<typeof startLogsPolling>[0]);
  }
  if (host.tab === "debug") {
    startDebugPolling(host as unknown as Parameters<typeof startDebugPolling>[0]);
  }
}

/**
 * Load bootstrap config, then either handle IAM auth flow or connect directly.
 * When authMode is "iam", we check for an OAuth callback or try to restore
 * a session from stored tokens before calling connectGateway.
 */
async function bootstrapAndConnect(host: LifecycleHost): Promise<void> {
  await loadControlUiBootstrapConfig(host);

  if (host.authMode !== "iam") {
    connectGateway(host as unknown as Parameters<typeof connectGateway>[0]);
    return;
  }

  // IAM mode: check for OAuth callback first
  const iamHost = host as unknown as Parameters<typeof handleIamCallback>[0];
  const handled = await handleIamCallback(iamHost);
  if (handled) {
    return; // handleIamCallback already called connectGateway
  }

  // Try to restore session from stored tokens
  const restored = await tryIamAutoLogin(iamHost);
  if (restored) {
    connectGateway(host as unknown as Parameters<typeof connectGateway>[0]);
    return;
  }

  // No session — user needs to click "Sign in with Hanzo"
}

export function handleFirstUpdated(host: LifecycleHost) {
  observeTopbar(host as unknown as Parameters<typeof observeTopbar>[0]);
}

export function handleDisconnected(host: LifecycleHost) {
  window.removeEventListener("popstate", host.popStateHandler);
  if (host.postMessageHandler) {
    window.removeEventListener("message", host.postMessageHandler);
    host.postMessageHandler = null;
  }
  stopNodesPolling(host as unknown as Parameters<typeof stopNodesPolling>[0]);
  stopLogsPolling(host as unknown as Parameters<typeof stopLogsPolling>[0]);
  stopDebugPolling(host as unknown as Parameters<typeof stopDebugPolling>[0]);
  detachThemeListener(host as unknown as Parameters<typeof detachThemeListener>[0]);
  host.topbarObserver?.disconnect();
  host.topbarObserver = null;
}

export function handleUpdated(host: LifecycleHost, changed: Map<PropertyKey, unknown>) {
  if (host.tab === "chat" && host.chatManualRefreshInFlight) {
    return;
  }
  if (
    host.tab === "chat" &&
    (changed.has("chatMessages") ||
      changed.has("chatToolMessages") ||
      changed.has("chatStream") ||
      changed.has("chatLoading") ||
      changed.has("tab"))
  ) {
    const forcedByTab = changed.has("tab");
    const forcedByLoad =
      changed.has("chatLoading") && changed.get("chatLoading") === true && !host.chatLoading;
    scheduleChatScroll(
      host as unknown as Parameters<typeof scheduleChatScroll>[0],
      forcedByTab || forcedByLoad || !host.chatHasAutoScrolled,
    );
  }
  if (
    host.tab === "logs" &&
    (changed.has("logsEntries") || changed.has("logsAutoFollow") || changed.has("tab"))
  ) {
    if (host.logsAutoFollow && host.logsAtBottom) {
      scheduleLogsScroll(
        host as unknown as Parameters<typeof scheduleLogsScroll>[0],
        changed.has("tab") || changed.has("logsAutoFollow"),
      );
    }
  }
}
