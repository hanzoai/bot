import type { BotPluginApi } from "@hanzo/bot/plugin-sdk/team";
import { emptyPluginConfigSchema } from "@hanzo/bot/plugin-sdk/team";
import {
  createHealthHandler,
  createConnectHandler,
  createEventsHandler,
  createTranslateHandler,
  createSummarizeHandler,
  createChatCompletionsProxyHandler,
  createMessagesProxyHandler,
} from "./src/routes.js";

const ROUTE_PREFIX = "/api/channels/team";

const plugin = {
  id: "team",
  name: "Team",
  description: "Hanzo Team workspace AI bot channel extension",
  configSchema: emptyPluginConfigSchema(),
  register(api: BotPluginApi) {
    // Health check — GET /api/channels/team/health
    api.registerHttpRoute({
      path: `${ROUTE_PREFIX}/health`,
      handler: createHealthHandler(),
      auth: "plugin",
    });

    // Workspace connection — POST /api/channels/team/connect
    api.registerHttpRoute({
      path: `${ROUTE_PREFIX}/connect`,
      handler: createConnectHandler(),
      auth: "plugin",
    });

    // Event processing — POST /api/channels/team/events
    api.registerHttpRoute({
      path: `${ROUTE_PREFIX}/events`,
      handler: createEventsHandler(),
      auth: "plugin",
    });

    // Translation — POST /api/channels/team/translate
    api.registerHttpRoute({
      path: `${ROUTE_PREFIX}/translate`,
      handler: createTranslateHandler(api),
      auth: "plugin",
    });

    // Summarization — POST /api/channels/team/summarize
    api.registerHttpRoute({
      path: `${ROUTE_PREFIX}/summarize`,
      handler: createSummarizeHandler(api),
      auth: "plugin",
    });

    // OpenAI-compatible proxy — POST /api/channels/team/v1/chat/completions
    api.registerHttpRoute({
      path: `${ROUTE_PREFIX}/v1/chat/completions`,
      handler: createChatCompletionsProxyHandler(api),
      auth: "plugin",
    });

    // Anthropic-compatible proxy — POST /api/channels/team/v1/messages
    api.registerHttpRoute({
      path: `${ROUTE_PREFIX}/v1/messages`,
      handler: createMessagesProxyHandler(api),
      auth: "plugin",
    });
  },
};

export default plugin;
