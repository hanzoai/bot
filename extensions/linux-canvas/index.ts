import { buildPluginConfigSchema, definePluginEntry } from "bot/plugin-sdk/plugin-entry";
import { z } from "zod";
import { createLinuxCanvasCommands } from "./api.js";

const linuxCanvasConfigSchema = buildPluginConfigSchema(z.strictObject({}));

export default definePluginEntry({
  id: "linux-canvas",
  name: "Linux Canvas",
  description: "Canvas rendering bridge for the Bot Linux desktop app.",
  configSchema: linuxCanvasConfigSchema,
  register(api) {
    for (const command of createLinuxCanvasCommands()) {
      api.registerNodeHostCommand(command);
    }
  },
});
