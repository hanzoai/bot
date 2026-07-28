// Openshell plugin entrypoint registers its Bot integration.
import { definePluginEntry } from "bot/plugin-sdk/plugin-entry";
import { registerSandboxBackend } from "bot/plugin-sdk/sandbox";
import {
  createOpenShellSandboxBackendFactory,
  createOpenShellSandboxBackendManager,
} from "./src/backend.js";
import { createOpenShellPluginConfigSchema, resolveOpenShellPluginConfig } from "./src/config.js";

export default definePluginEntry({
  id: "openshell",
  name: "OpenShell Sandbox",
  description: "OpenShell-backed sandbox runtime for agent exec and file tools.",
  configSchema: createOpenShellPluginConfigSchema(),
  register(api) {
    if (api.registrationMode !== "full") {
      return;
    }
    const pluginConfig = resolveOpenShellPluginConfig(api.pluginConfig);
    registerSandboxBackend("openshell", {
      factory: createOpenShellSandboxBackendFactory({
        pluginConfig,
      }),
      manager: createOpenShellSandboxBackendManager({
        pluginConfig,
      }),
      resolveWorkdir: () => pluginConfig.remoteWorkspaceDir,
    });
  },
});
