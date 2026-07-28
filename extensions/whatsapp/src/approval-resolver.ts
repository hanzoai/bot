// Whatsapp plugin module implements approval resolver behavior.
import {
  resolveApprovalOverGateway,
  type ApprovalResolveResult,
} from "bot/plugin-sdk/approval-gateway-runtime";
import type { ExecApprovalReplyDecision } from "bot/plugin-sdk/approval-reply-runtime";
import type { BotConfig } from "bot/plugin-sdk/config-contracts";
import { isApprovalNotFoundError } from "bot/plugin-sdk/error-runtime";

export { isApprovalNotFoundError };

export async function resolveWhatsAppApproval(params: {
  cfg: BotConfig;
  approvalId: string;
  approvalKind: "exec" | "plugin";
  decision: ExecApprovalReplyDecision;
  senderId?: string | null;
  gatewayUrl?: string;
}): Promise<ApprovalResolveResult> {
  return await resolveApprovalOverGateway({
    cfg: params.cfg,
    approvalId: params.approvalId,
    approvalKind: params.approvalKind,
    decision: params.decision,
    senderId: params.senderId,
    gatewayUrl: params.gatewayUrl,
    clientDisplayName: `WhatsApp approval (${params.senderId?.trim() || "unknown"})`,
  });
}
