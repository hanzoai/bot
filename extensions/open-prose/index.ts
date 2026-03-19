import { definePluginEntry, type Hanzo BotPluginApi } from "./runtime-api.js";

export default definePluginEntry({
  id: "open-prose",
  name: "OpenProse",
  description: "Plugin-shipped prose skills bundle",
  register(_api: Hanzo BotPluginApi) {
    // OpenProse is delivered via plugin-shipped skills.
  },
});
