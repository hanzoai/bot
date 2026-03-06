import type { BotPluginApi } from "@hanzo/bot/plugin-sdk/bluebubbles";
import { emptyPluginConfigSchema } from "@hanzo/bot/plugin-sdk/bluebubbles";
import { bluebubblesPlugin } from "./src/channel.js";
import { setBlueBubblesRuntime } from "./src/runtime.js";

const plugin = {
  id: "bluebubbles",
  name: "BlueBubbles",
  description: "BlueBubbles channel plugin (macOS app)",
  configSchema: emptyPluginConfigSchema(),
  register(api: BotPluginApi) {
    setBlueBubblesRuntime(api.runtime);
    api.registerChannel({ plugin: bluebubblesPlugin });
  },
};

export default plugin;
