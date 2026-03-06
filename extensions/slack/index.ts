import type { BotPluginApi } from "@hanzo/bot/plugin-sdk/slack";
import { emptyPluginConfigSchema } from "@hanzo/bot/plugin-sdk/slack";
import { slackPlugin } from "./src/channel.js";
import { setSlackRuntime } from "./src/runtime.js";

const plugin = {
  id: "slack",
  name: "Slack",
  description: "Slack channel plugin",
  configSchema: emptyPluginConfigSchema(),
  register(api: BotPluginApi) {
    setSlackRuntime(api.runtime);
    api.registerChannel({ plugin: slackPlugin });
  },
};

export default plugin;
