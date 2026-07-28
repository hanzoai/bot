// Whatsapp plugin entrypoint registers its Bot integration.
import {
  defineBundledChannelEntry,
  loadBundledEntryExportSync,
} from "bot/plugin-sdk/channel-entry-contract";
import type { BotPluginApi } from "bot/plugin-sdk/channel-entry-contract";

function registerWhatsAppCallTool(api: BotPluginApi): void {
  const registerTool = loadBundledEntryExportSync<(api: BotPluginApi) => void>(
    import.meta.url,
    {
      specifier: "./call-tool-api.js",
      exportName: "registerWhatsAppCallTool",
    },
  );
  registerTool(api);
}

export default defineBundledChannelEntry({
  id: "whatsapp",
  name: "WhatsApp",
  description: "WhatsApp channel plugin",
  importMetaUrl: import.meta.url,
  plugin: {
    specifier: "./channel-plugin-api.js",
    exportName: "whatsappPlugin",
  },
  runtime: {
    specifier: "./runtime-setter-api.js",
    exportName: "setWhatsAppRuntime",
  },
  registerFull: registerWhatsAppCallTool,
});
