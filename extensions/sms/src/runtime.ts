// Sms plugin module implements runtime behavior.
import { createPluginRuntimeStore, type PluginRuntime } from "bot/plugin-sdk/runtime-store";

const { setRuntime: setSmsRuntime, getRuntime: getSmsRuntime } =
  createPluginRuntimeStore<PluginRuntime>({
    pluginId: "sms",
    errorMessage: "SMS runtime not initialized - plugin not registered",
  });

export { getSmsRuntime, setSmsRuntime };
