import { afterEach, beforeEach } from "vitest";
import { BotApp } from "../app.ts";

// oxlint-disable-next-line typescript/unbound-method
const originalConnect = BotApp.prototype.connect;

export function mountApp(pathname: string) {
  window.history.replaceState({}, "", pathname);
  const app = document.createElement("bot-app") as BotApp;
  document.body.append(app);
  return app;
}

export function registerAppMountHooks() {
  beforeEach(() => {
    BotApp.prototype.connect = () => {
      // no-op: avoid real gateway WS connections in browser tests
    };
    window.__BOT_CONTROL_UI_BASE_PATH__ = undefined;
    localStorage.clear();
    document.body.innerHTML = "";
  });

  afterEach(() => {
    BotApp.prototype.connect = originalConnect;
    window.__BOT_CONTROL_UI_BASE_PATH__ = undefined;
    localStorage.clear();
    document.body.innerHTML = "";
  });
}
