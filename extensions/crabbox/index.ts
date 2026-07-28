import { definePluginEntry } from "bot/plugin-sdk/plugin-entry";
import { createCrabboxWorkerProvider, resolveBotRoot } from "./src/crabbox-worker-provider.js";

export default definePluginEntry({
  id: "crabbox",
  name: "Crabbox Worker Provider",
  description: "Cloud worker provider backed by the Crabbox CLI",
  register(api) {
    api.registerWorkerProvider(
      createCrabboxWorkerProvider({ botRoot: resolveBotRoot(api.rootDir) }),
    );
  },
});
