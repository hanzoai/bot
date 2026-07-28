// Discord plugin module implements approval shared behavior.
import { doesApprovalRequestMatchChannelAccount } from "bot/plugin-sdk/approval-native-runtime";
import type {
  ExecApprovalRequest,
  PluginApprovalRequest,
} from "bot/plugin-sdk/approval-runtime";
import type {
  DiscordExecApprovalConfig,
  BotConfig,
} from "bot/plugin-sdk/config-contracts";
import { resolveDiscordAccount } from "./accounts.js";
import {
  isChannelExecApprovalClientEnabledFromConfig,
  matchesApprovalRequestFilters,
} from "./approval-runtime.js";
import { getDiscordExecApprovalApprovers } from "./exec-approvals.js";

type ApprovalRequest = ExecApprovalRequest | PluginApprovalRequest;

export function shouldHandleDiscordApprovalRequest(params: {
  cfg: BotConfig;
  accountId?: string | null;
  request: ApprovalRequest;
  configOverride?: DiscordExecApprovalConfig | null;
}): boolean {
  const config =
    params.configOverride ??
    resolveDiscordAccount({ cfg: params.cfg, accountId: params.accountId }).config.execApprovals;
  const approvers = getDiscordExecApprovalApprovers({
    cfg: params.cfg,
    accountId: params.accountId,
    configOverride: params.configOverride,
  });
  if (
    !doesApprovalRequestMatchChannelAccount({
      cfg: params.cfg,
      request: params.request,
      channel: "discord",
      accountId: params.accountId,
    })
  ) {
    return false;
  }
  if (
    !isChannelExecApprovalClientEnabledFromConfig({
      enabled: config?.enabled,
      approverCount: approvers.length,
    })
  ) {
    return false;
  }
  return matchesApprovalRequestFilters({
    request: params.request.request,
    agentFilter: config?.agentFilter,
    sessionFilter: config?.sessionFilter,
  });
}
