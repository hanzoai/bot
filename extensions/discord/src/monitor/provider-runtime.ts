import {
  listNativeCommandSpecsForConfig,
  listSkillCommandsForAgents,
} from "bot/plugin-sdk/command-auth-native";
import {
  resolveNativeCommandsEnabled,
  resolveNativeSkillsEnabled,
} from "bot/plugin-sdk/native-command-config-runtime";
import { isVerbose, shouldLogVerbose } from "bot/plugin-sdk/runtime-env";
import { resolveDiscordAccount } from "../accounts.js";
import { Client } from "../internal/discord.js";
import { fetchDiscordApplicationId } from "../probe.js";
import { createDiscordNativeCommand } from "./native-command.js";
import type { GetPluginCommandSpecs } from "./provider.commands.js";
import { runDiscordGatewayLifecycle } from "./provider.lifecycle.js";

type DiscordVoiceRuntimeModule = typeof import("../voice/manager.runtime.js");
type DiscordProviderSessionRuntimeModule = typeof import("./provider-session.runtime.js");

let discordVoiceRuntimePromise: Promise<DiscordVoiceRuntimeModule> | undefined;
let discordProviderSessionRuntimePromise: Promise<DiscordProviderSessionRuntimeModule> | undefined;

async function loadDiscordVoiceRuntime(): Promise<DiscordVoiceRuntimeModule> {
  const promise = discordVoiceRuntimePromise ?? import("../voice/manager.runtime.js");
  discordVoiceRuntimePromise = promise;
  try {
    return await promise;
  } catch (error) {
    if (discordVoiceRuntimePromise === promise) {
      discordVoiceRuntimePromise = undefined;
    }
    throw error;
  }
}

async function loadDiscordProviderSessionRuntime(): Promise<DiscordProviderSessionRuntimeModule> {
  const promise = discordProviderSessionRuntimePromise ?? import("./provider-session.runtime.js");
  discordProviderSessionRuntimePromise = promise;
  try {
    return await promise;
  } catch (error) {
    if (discordProviderSessionRuntimePromise === promise) {
      discordProviderSessionRuntimePromise = undefined;
    }
    throw error;
  }
}

export const discordProviderRuntime = {
  fetchDiscordApplicationId,
  createDiscordNativeCommand,
  runDiscordGatewayLifecycle,
  loadDiscordVoiceRuntime,
  loadDiscordProviderSessionRuntime,
  createClient: (...args: ConstructorParameters<typeof Client>) => new Client(...args),
  getPluginCommandSpecs: undefined as GetPluginCommandSpecs | undefined,
  resolveDiscordAccount,
  resolveNativeCommandsEnabled,
  resolveNativeSkillsEnabled,
  listNativeCommandSpecsForConfig,
  listSkillCommandsForAgents,
  isVerbose,
  shouldLogVerbose,
};
