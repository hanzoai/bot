// Telegram type declarations define plugin contracts.
import type { Bot } from "grammy";
import type { Message } from "grammy/types";
import type { BotConfig } from "bot/plugin-sdk/config-contracts";
import type {
  DmPolicy,
  TelegramDirectConfig,
  TelegramGroupConfig,
  TelegramTopicConfig,
} from "bot/plugin-sdk/config-contracts";
import type { HistoryEntry } from "bot/plugin-sdk/reply-history";
import type { MsgContext } from "bot/plugin-sdk/reply-runtime";
import type { TelegramMediaKind } from "./bot/body-helpers.js";
import type { StickerMetadata, TelegramContext } from "./bot/types.js";
import type { TelegramReplyChainEntry } from "./message-cache.js";
import type { TelegramSendChatActionHandler } from "./sendchataction-401-backoff.js";

export type TelegramMediaRef = {
  kind: TelegramMediaKind;
  path?: string;
  contentType?: string;
  stickerMetadata?: StickerMetadata;
  sourceMessageId?: string;
};

export type TelegramMessageContextOptions = {
  commandSource?: "text" | "native";
  forceWasMentioned?: boolean;
  messageIdOverride?: string;
  receivedAtMs?: number;
  ingressBuffer?: "inbound-debounce" | "text-fragment";
  promptContextMinTimestampMs?: number;
  promptContextAmbientWatermark?: TelegramAmbientTranscriptWatermark;
  ambientTranscriptBody?: string;
  inboundDebounceMessages?: readonly Message[];
  spooledReplay?: boolean;
  /** Use an attempt-local participant so an outer retry loop owns final spool settlement. */
  isolateSpooledReplaySettlement?: boolean;
};

export type TelegramPromptContextEntry = NonNullable<
  MsgContext["ChannelStructuredContext"]
>[number];

export type TelegramAmbientTranscriptWatermark = {
  messageId: string;
  timestampMs?: number;
};

export type TelegramLogger = {
  info: (obj: Record<string, unknown>, msg: string) => void;
};

type ResolveTelegramGroupConfig = (
  chatId: string | number,
  messageThreadId: number | undefined,
  cfg: BotConfig,
) => {
  groupConfig?: TelegramGroupConfig | TelegramDirectConfig;
  topicConfig?: TelegramTopicConfig;
};

type ResolveGroupActivation = (params: {
  chatId: string | number;
  agentId?: string;
  messageThreadId?: number;
  sessionKey?: string;
  cfg: BotConfig;
}) => boolean | undefined;

type ResolveGroupRequireMention = (chatId: string | number, cfg: BotConfig) => boolean;

type TelegramMessageContextRuntimeOverrides = Partial<
  Pick<
    typeof import("./bot-message-context.runtime.js"),
    "createStatusReactionController" | "ensureConfiguredBindingRouteReady" | "recordChannelActivity"
  >
>;

export type TelegramMessageContextSessionRuntimeOverrides = Partial<
  Pick<
    typeof import("./bot-message-context.session.runtime.js"),
    | "buildChannelInboundEventContext"
    | "readSessionUpdatedAt"
    | "recordInboundSession"
    | "readAmbientTranscriptWatermark"
    | "resolveAmbientTranscriptWatermarkKey"
    | "resolveInboundLastRouteSessionKey"
    | "resolvePinnedMainDmOwnerFromAllowlist"
    | "resolveStorePath"
  >
>;

export type BuildTelegramMessageContextParams = {
  primaryCtx: TelegramContext;
  allMedia: TelegramMediaRef[];
  replyMedia?: TelegramMediaRef[];
  replyChain?: TelegramReplyChainEntry[];
  promptContext?: TelegramPromptContextEntry[];
  storeAllowFrom: string[];
  options?: TelegramMessageContextOptions;
  bot: Bot;
  cfg: BotConfig;
  account: { accountId: string };
  historyLimit: number;
  groupHistories: Map<string, HistoryEntry[]>;
  dmPolicy: DmPolicy;
  allowFrom?: Array<string | number>;
  groupAllowFrom?: Array<string | number>;
  ackReactionScope: "off" | "none" | "group-mentions" | "group-all" | "direct" | "all";
  logger: TelegramLogger;
  resolveGroupActivation: ResolveGroupActivation;
  resolveGroupRequireMention: ResolveGroupRequireMention;
  resolveTelegramGroupConfig: ResolveTelegramGroupConfig;
  runtime?: TelegramMessageContextRuntimeOverrides;
  sessionRuntime?: TelegramMessageContextSessionRuntimeOverrides;
  upsertPairingRequest?: typeof import("bot/plugin-sdk/conversation-runtime").upsertChannelPairingRequest;
  /** Global (per-account) handler for sendChatAction 401 backoff (#27092). */
  sendChatActionHandler: TelegramSendChatActionHandler;
};
