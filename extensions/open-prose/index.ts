// Open Prose plugin entrypoint registers its Bot integration.
import { definePluginEntry, type BotPluginApi } from "./runtime-api.js";

export default definePluginEntry({
  id: "open-prose",
  name: "OpenProse",
  description: "Plugin-shipped prose skills bundle",
  register(_api: BotPluginApi) {
    // OpenProse is delivered via plugin-shipped skills.
  },
});
