// Googlechat plugin module implements runtime behavior.
import { createPluginRuntimeStore } from "bot/plugin-sdk/runtime-store";
import type { PluginRuntime } from "bot/plugin-sdk/runtime-store";

const { setRuntime: setGoogleChatRuntime, getRuntime: getGoogleChatRuntime } =
  createPluginRuntimeStore<PluginRuntime>({
    pluginId: "googlechat",
    errorMessage: "Google Chat runtime not initialized",
  });
export { getGoogleChatRuntime, setGoogleChatRuntime };
