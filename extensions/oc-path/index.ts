// OC Path plugin entrypoint registers its Bot integration.
import { definePluginEntry } from "bot/plugin-sdk/plugin-entry";
import { registerOcPathCli } from "./cli-registration.js";

export default definePluginEntry({
  id: "oc-path",
  name: "OC Path",
  description: "Adds the bot path CLI for oc:// workspace file addressing.",
  register(api) {
    registerOcPathCli(api);
  },
});
