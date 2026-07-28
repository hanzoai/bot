// Imessage plugin module implements media contract behavior.
import { mergeInboundPathRoots } from "bot/plugin-sdk/channel-inbound";
import type { BotConfig } from "bot/plugin-sdk/config-contracts";
import { resolveIMessageAccount } from "./accounts.js";

export const DEFAULT_IMESSAGE_ATTACHMENT_ROOTS = ["/Users/*/Library/Messages/Attachments"] as const;

export function resolveIMessageAttachmentRoots(params: {
  cfg: BotConfig;
  accountId?: string | null;
}): string[] {
  const account = resolveIMessageAccount(params);
  return mergeInboundPathRoots(
    account.config.attachmentRoots,
    params.cfg.channels?.imessage?.attachmentRoots,
    DEFAULT_IMESSAGE_ATTACHMENT_ROOTS,
  );
}

export function resolveIMessageRemoteAttachmentRoots(params: {
  cfg: BotConfig;
  accountId?: string | null;
}): string[] {
  const account = resolveIMessageAccount(params);
  return mergeInboundPathRoots(
    account.config.remoteAttachmentRoots,
    params.cfg.channels?.imessage?.remoteAttachmentRoots,
    account.config.attachmentRoots,
    params.cfg.channels?.imessage?.attachmentRoots,
    DEFAULT_IMESSAGE_ATTACHMENT_ROOTS,
  );
}
