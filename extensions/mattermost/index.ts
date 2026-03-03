import type { BotPluginApi } from "bot/plugin-sdk";
import { emptyPluginConfigSchema } from "bot/plugin-sdk";
import { mattermostPlugin } from "./src/channel.js";
import { getSlashCommandState, registerSlashCommandRoute } from "./src/mattermost/slash-state.js";
import { setMattermostRuntime } from "./src/runtime.js";

const plugin = {
  id: "mattermost",
  name: "Mattermost",
  description: "Mattermost channel plugin",
  configSchema: emptyPluginConfigSchema(),
  register(api: BotPluginApi) {
    setMattermostRuntime(api.runtime);
    api.registerChannel({ plugin: mattermostPlugin });

    // Register the HTTP route for slash command callbacks.
    // The actual command registration with MM happens in the monitor
    // after the bot connects and we know the team ID.
    registerSlashCommandRoute(api);
  },
};

export default plugin;
