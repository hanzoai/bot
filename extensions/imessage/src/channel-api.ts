// Imessage API module exposes the plugin public contract.
import { formatTrimmedAllowFromEntries } from "bot/plugin-sdk/channel-config-helpers";
import { PAIRING_APPROVED_MESSAGE } from "bot/plugin-sdk/channel-status";
import {
  DEFAULT_ACCOUNT_ID,
  getChatChannelMeta,
  type ChannelPlugin,
} from "bot/plugin-sdk/core";
import { resolveChannelMediaMaxBytes } from "bot/plugin-sdk/media-runtime";
import { collectStatusIssuesFromLastError } from "bot/plugin-sdk/status-helpers";
import { normalizeIMessageMessagingTarget } from "./normalize.js";
export { chunkTextForOutbound } from "bot/plugin-sdk/text-chunking";

export {
  collectStatusIssuesFromLastError,
  DEFAULT_ACCOUNT_ID,
  formatTrimmedAllowFromEntries,
  getChatChannelMeta,
  normalizeIMessageMessagingTarget,
  PAIRING_APPROVED_MESSAGE,
  resolveChannelMediaMaxBytes,
};

export type { ChannelPlugin };
