// Qqbot plugin module implements runtime behavior.
import type { PluginRuntime } from "bot/plugin-sdk/core";
import { createPluginRuntimeStore } from "bot/plugin-sdk/runtime-store";
import { setBotVersion } from "../engine/messaging/sender.js";

// Single plugin runtime per process — concurrent multi-tenant qqbot runtimes are not supported.
const { setRuntime: _setRuntime, getRuntime: getQQBotRuntime } =
  createPluginRuntimeStore<PluginRuntime>({
    pluginId: "qqbot",
    errorMessage: "QQBot runtime not initialized",
  });

/** Set the QQBot runtime and inject the framework version into the User-Agent. */
function setQQBotRuntime(runtime: PluginRuntime): void {
  _setRuntime(runtime);
  // Inject the framework version into the User-Agent string (same as standalone).
  setBotVersion(runtime.version);
}

export { getQQBotRuntime, setQQBotRuntime };
