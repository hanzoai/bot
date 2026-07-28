// Whatsapp plugin module implements doctor behavior.
import type {
  ChannelDoctorAdapter,
  ChannelDoctorConfigMutation,
} from "bot/plugin-sdk/channel-contract";
import type { BotConfig } from "bot/plugin-sdk/config-contracts";

export function normalizeCompatibilityConfig({
  cfg,
}: {
  cfg: BotConfig;
}): ChannelDoctorConfigMutation {
  return { config: cfg, changes: [] };
}

export const whatsappDoctor: ChannelDoctorAdapter = {
  normalizeCompatibilityConfig,
};
