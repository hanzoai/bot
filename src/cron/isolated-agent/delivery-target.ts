import type { ChannelId } from "../../channels/plugins/types.js";
import type { BotConfig } from "../../config/config.js";
import type { OutboundChannel } from "../../infra/outbound/targets.js";
import { DEFAULT_CHAT_CHANNEL } from "../../channels/registry.js";
import {
  loadSessionStore,
  resolveAgentMainSessionKey,
  resolveStorePath,
} from "../../config/sessions.js";
import { resolveMessageChannelSelection } from "../../infra/outbound/channel-selection.js";
import {
  resolveOutboundTarget,
  resolveSessionDeliveryTarget,
} from "../../infra/outbound/targets.js";

/**
 * Result of resolving a cron delivery target.
 * When `ok` is `true` the `to` field is a non-empty string and `error` is
 * absent. When `ok` is `false` an `error` is present.
 */
export type DeliveryTargetResolution = {
  ok: boolean;
  channel: Exclude<OutboundChannel, "none">;
  to?: string;
  accountId?: string;
  threadId?: string | number;
  mode: "explicit" | "implicit";
  error?: Error;
};

export async function resolveDeliveryTarget(
  cfg: BotConfig,
  agentId: string,
  jobPayload: {
    channel?: "last" | ChannelId;
    to?: string;
    sessionKey?: string;
    accountId?: string;
  },
): Promise<DeliveryTargetResolution> {
  const requestedChannel = typeof jobPayload.channel === "string" ? jobPayload.channel : "last";
  const explicitTo = typeof jobPayload.to === "string" ? jobPayload.to : undefined;
  const allowMismatchedLastTo = requestedChannel === "last";

  const sessionCfg = cfg.session;
  const mainSessionKey = resolveAgentMainSessionKey({ cfg, agentId });
  const storePath = resolveStorePath(sessionCfg?.store, { agentId });
  const store = loadSessionStore(storePath);
  const main = store[mainSessionKey];

  // Prefer the thread-specific session entry when a sessionKey is provided.
  const threadEntry =
    jobPayload.sessionKey && jobPayload.sessionKey !== mainSessionKey
      ? store[jobPayload.sessionKey]
      : undefined;
  const entry = threadEntry ?? main;

  const preliminary = resolveSessionDeliveryTarget({
    entry,
    requestedChannel,
    explicitTo,
    allowMismatchedLastTo,
  });

  let fallbackChannel: Exclude<OutboundChannel, "none"> | undefined;
  let ambiguousChannelError: Error | undefined;
  if (!preliminary.channel) {
    try {
      const selection = await resolveMessageChannelSelection({ cfg });
      fallbackChannel = selection.channel;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("Channel is required")) {
        ambiguousChannelError = err instanceof Error ? err : new Error(msg);
      } else {
        fallbackChannel = preliminary.lastChannel ?? DEFAULT_CHAT_CHANNEL;
      }
    }
  }

  if (ambiguousChannelError) {
    return {
      ok: false,
      channel: undefined as unknown as Exclude<OutboundChannel, "none">,
      mode: "implicit",
      error: ambiguousChannelError,
    };
  }

  const resolved = fallbackChannel
    ? resolveSessionDeliveryTarget({
        entry,
        requestedChannel,
        explicitTo,
        fallbackChannel,
        allowMismatchedLastTo,
        mode: preliminary.mode,
      })
    : preliminary;

  const channel = resolved.channel ?? fallbackChannel ?? DEFAULT_CHAT_CHANNEL;
  const mode = resolved.mode as "explicit" | "implicit";
  const toCandidate = resolved.to;

  // Only carry threadId when delivering to the same recipient as the session's
  // last conversation, OR when the threadId was explicitly parsed from the
  // target (e.g. `:topic:NNN`). This prevents stale thread IDs from being
  // sent to a different target where they would cause API errors.
  const threadId =
    resolved.threadId &&
    (resolved.threadIdExplicit || (resolved.to && resolved.to === resolved.lastTo))
      ? resolved.threadId
      : undefined;

  // Resolve accountId: explicit payload overrides session and bindings.
  let accountId = jobPayload.accountId ?? resolved.accountId;
  if (!accountId && cfg.bindings) {
    const binding = cfg.bindings.find((b) => b.agentId === agentId && b.match?.channel === channel);
    if (binding?.match?.accountId) {
      accountId = binding.match.accountId;
    }
  }

  if (!toCandidate) {
    return {
      ok: false,
      channel,
      accountId,
      threadId,
      mode,
      error: new Error(`No delivery target resolved for channel "${channel}"`),
    };
  }

  const docked = resolveOutboundTarget({
    channel,
    to: toCandidate,
    cfg,
    accountId,
    mode,
  });
  if (!docked.ok) {
    return {
      ok: false,
      channel,
      accountId,
      threadId,
      mode,
      error: docked.error,
    };
  }
  return {
    ok: true,
    channel,
    to: docked.to,
    accountId,
    threadId,
    mode,
  };
}
