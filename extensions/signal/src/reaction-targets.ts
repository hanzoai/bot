import type { OutboundDeliveryResult } from "bot/plugin-sdk/channel-send-result";
import type { BotConfig } from "bot/plugin-sdk/config-contracts";
import type { ReplyPayload } from "bot/plugin-sdk/reply-runtime";
import { registerSignalApprovalReactionTargetForDeliveredPayload } from "./approval-reactions.js";
import { registerSignalQuestionReactionTargetForDeliveredPayload } from "./question-reactions.js";

export function registerSignalReactionTargetsForDeliveredPayload(params: {
  cfg: BotConfig;
  target: { channel: string; to: string; accountId?: string | null };
  payload: ReplyPayload;
  results: readonly OutboundDeliveryResult[];
  targetAuthor?: string | null;
  targetAuthorUuid?: string | null;
}): void {
  registerSignalQuestionReactionTargetForDeliveredPayload(params);
  registerSignalApprovalReactionTargetForDeliveredPayload(params);
}
