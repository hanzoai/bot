import { dispatchChannelInboundTurn } from "bot/plugin-sdk/channel-inbound";
import { readChannelAllowFromStore } from "bot/plugin-sdk/conversation-runtime";
import { getPluginCommandSpecs } from "bot/plugin-sdk/plugin-runtime";
// Telegram plugin module implements bot native command deps behavior.
import type {
  ModelsAuthLoginFlowOptions,
  ModelsAuthLoginFlowResult,
} from "bot/plugin-sdk/provider-auth-login-flow-runtime";
import { getRuntimeConfig } from "bot/plugin-sdk/runtime-config-snapshot";
import { listSkillCommandsForAgents } from "bot/plugin-sdk/skill-commands-runtime";
import type { TelegramBotDeps } from "./bot-deps.js";
import { syncTelegramMenuCommands } from "./bot-native-command-menu.js";
import { loadTelegramSendModule } from "./send-runtime.js";

export type TelegramNativeCommandDeps = Pick<
  TelegramBotDeps,
  | "editMessageTelegram"
  | "getRuntimeConfig"
  | "listSkillCommandsForAgents"
  | "readChannelAllowFromStore"
  | "syncTelegramMenuCommands"
> & {
  dispatchChannelInboundTurn?: typeof dispatchChannelInboundTurn;
  getPluginCommandSpecs?: typeof getPluginCommandSpecs;
  runModelsAuthLoginFlow?: (opts: ModelsAuthLoginFlowOptions) => Promise<ModelsAuthLoginFlowResult>;
};

export const defaultTelegramNativeCommandDeps: TelegramNativeCommandDeps & {
  dispatchChannelInboundTurn: typeof dispatchChannelInboundTurn;
} = {
  get getRuntimeConfig() {
    return getRuntimeConfig;
  },
  get readChannelAllowFromStore() {
    return readChannelAllowFromStore;
  },
  get dispatchChannelInboundTurn() {
    return dispatchChannelInboundTurn;
  },
  get listSkillCommandsForAgents() {
    return listSkillCommandsForAgents;
  },
  get syncTelegramMenuCommands() {
    return syncTelegramMenuCommands;
  },
  get getPluginCommandSpecs() {
    return getPluginCommandSpecs;
  },
  async runModelsAuthLoginFlow(opts) {
    const { runModelsAuthLoginFlow } =
      await import("bot/plugin-sdk/provider-auth-login-flow-runtime");
    return await runModelsAuthLoginFlow(opts);
  },
  async editMessageTelegram(...args) {
    const { editMessageTelegram } = await loadTelegramSendModule();
    return await editMessageTelegram(...args);
  },
};
