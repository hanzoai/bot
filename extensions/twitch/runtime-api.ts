// Private runtime barrel for the bundled Twitch extension.
// Keep this barrel thin and aligned with the local extension surface.

export type {
  ChannelAccountSnapshot,
  ChannelCapabilities,
  ChannelGatewayContext,
  ChannelLogSink,
  ChannelMessageActionAdapter,
  ChannelMessageActionContext,
  ChannelMeta,
  ChannelOutboundAdapter,
  ChannelOutboundContext,
  ChannelResolveKind,
  ChannelResolveResult,
  ChannelStatusAdapter,
} from "bot/plugin-sdk/channel-contract";
export type { ChannelPlugin } from "bot/plugin-sdk/channel-core";
export type { OutboundDeliveryResult } from "bot/plugin-sdk/channel-send-result";
export type { BotConfig } from "bot/plugin-sdk/config-contracts";
export type { RuntimeEnv } from "bot/plugin-sdk/runtime";
export type { WizardPrompter } from "bot/plugin-sdk/setup";
