// Mattermost plugin module implements runtime behavior.
import { createPluginRuntimeStore } from "bot/plugin-sdk/runtime-store";
import type { PluginRuntime } from "bot/plugin-sdk/runtime-store";

const {
  setRuntime: setMattermostRuntime,
  getRuntime: getMattermostRuntime,
  tryGetRuntime: getOptionalMattermostRuntime,
} = createPluginRuntimeStore<PluginRuntime>({
  pluginId: "mattermost",
  errorMessage: "Mattermost runtime not initialized",
});
export { getMattermostRuntime, getOptionalMattermostRuntime, setMattermostRuntime };
