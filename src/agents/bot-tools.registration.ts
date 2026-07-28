/**
 * Bot-owned tool registration filters.
 *
 * Keeps optional tool gating separate from tool construction so config and execution contracts decide exposure.
 */
import { uniqueStrings } from "@hanzo/bot-normalization-core/string-normalization";
import type { BotConfig } from "../config/types.bot.js";
import { isPrimaryBootstrapRun } from "./bootstrap-routing.js";
import { isToolAllowedByPolicyName } from "./tool-policy-match.js";
import type { AnyAgentTool } from "./tools/common.js";

/**
 * Registration helpers for optional Bot-owned tools.
 *
 * This keeps model/runtime gating separate from tool construction so callers can
 * assemble candidate tools first, then filter by config and execution contract.
 */
/** Drops disabled optional tools while preserving candidate order. */
export function collectPresentBotTools(
  candidates: readonly (AnyAgentTool | null | undefined)[],
): AnyAgentTool[] {
  return candidates.filter((tool): tool is AnyAgentTool => tool !== null && tool !== undefined);
}

/** Decides whether update_plan should be included in the assembled Bot tool set. */
export function shouldIncludeUpdatePlanToolForBotTools(params: {
  config?: BotConfig;
  pluginToolDenylist?: string[];
}): boolean {
  // Default-on with an explicit kill switch: only `false` opts out.
  if (params.config?.tools?.updatePlan === false) {
    return false;
  }
  const deny = uniqueStrings([
    ...(params.config?.tools?.deny ?? []),
    ...(params.pluginToolDenylist ?? []),
  ]);
  return isToolAllowedByPolicyName("update_plan", { deny });
}

/** Includes ask_user only on a primary session and when normal deny policy permits it. */
export function shouldIncludeAskUserToolForBotTools(params: {
  config?: BotConfig;
  agentSessionKey?: string;
  pluginToolDenylist?: string[];
}): boolean {
  const sessionKey = params.agentSessionKey?.trim();
  if (!sessionKey) {
    return false;
  }
  const deny = uniqueStrings([
    ...(params.config?.tools?.deny ?? []),
    ...(params.pluginToolDenylist ?? []),
  ]);
  return isPrimaryBootstrapRun(sessionKey) && isToolAllowedByPolicyName("ask_user", { deny });
}
