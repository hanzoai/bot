// Googlechat plugin module implements gateway behavior.
import { CHANNEL_APPROVAL_NATIVE_RUNTIME_CONTEXT_CAPABILITY } from "bot/plugin-sdk/approval-handler-adapter-runtime";
import type { ChannelRuntimeSurface } from "bot/plugin-sdk/channel-contract";
import {
  createAccountStatusSink,
  runPassiveAccountLifecycle,
} from "bot/plugin-sdk/channel-outbound";
import { registerChannelRuntimeContext } from "bot/plugin-sdk/channel-runtime-context";
import type { BotConfig } from "bot/plugin-sdk/config-contracts";
import { createLazyRuntimeNamedExport } from "bot/plugin-sdk/lazy-runtime";
import type { ChannelAccountSnapshot } from "bot/plugin-sdk/status-helpers";
import type { ResolvedGoogleChatAccount } from "./accounts.js";
import { isGoogleChatNativeApprovalClientEnabled } from "./approval-native.js";
import type { GoogleChatRuntimeEnv } from "./monitor-types.js";

const loadGoogleChatChannelRuntime = createLazyRuntimeNamedExport(
  () => import("./channel.runtime.js"),
  "googleChatChannelRuntime",
);

export async function startGoogleChatGatewayAccount(ctx: {
  account: ResolvedGoogleChatAccount;
  cfg: BotConfig;
  runtime: GoogleChatRuntimeEnv;
  abortSignal: AbortSignal;
  channelRuntime?: ChannelRuntimeSurface;
  setStatus: (next: ChannelAccountSnapshot) => void;
  log?: {
    info?: (message: string) => void;
  };
}): Promise<void> {
  const account = ctx.account;
  const statusSink = createAccountStatusSink({
    accountId: account.accountId,
    setStatus: ctx.setStatus,
  });
  ctx.log?.info?.(`[${account.accountId}] starting Google Chat webhook`);
  const { resolveGoogleChatWebhookPath, startGoogleChatMonitor } =
    await loadGoogleChatChannelRuntime();
  statusSink({
    running: true,
    lastStartAt: Date.now(),
    webhookPath: resolveGoogleChatWebhookPath({ account }),
    audienceType: account.config.audienceType,
    audience: account.config.audience,
  });
  let stopped = false;
  const markStopped = () => {
    if (stopped) {
      return;
    }
    stopped = true;
    statusSink({
      running: false,
      lastStopAt: Date.now(),
    });
  };
  if (
    isGoogleChatNativeApprovalClientEnabled({
      cfg: ctx.cfg,
      accountId: account.accountId,
    })
  ) {
    registerChannelRuntimeContext({
      channelRuntime: ctx.channelRuntime,
      channelId: "googlechat",
      accountId: account.accountId,
      capability: CHANNEL_APPROVAL_NATIVE_RUNTIME_CONTEXT_CAPABILITY,
      context: { account },
      abortSignal: ctx.abortSignal,
    });
  }
  try {
    await runPassiveAccountLifecycle({
      abortSignal: ctx.abortSignal,
      start: async () =>
        await startGoogleChatMonitor({
          account,
          config: ctx.cfg,
          runtime: ctx.runtime,
          abortSignal: ctx.abortSignal,
          webhookPath: account.config.webhookPath,
          webhookUrl: account.config.webhookUrl,
          statusSink,
        }),
      stop: async (unregister) => {
        await unregister?.();
      },
      onStop: async () => {
        markStopped();
      },
    });
  } catch (error) {
    markStopped();
    throw error;
  }
}
