import type { EmbeddedPiSubscribeContext } from "./pi-embedded-subscribe.handlers.types.js";
import { emitAgentEvent } from "../infra/agent-events.js";
import { createInlineCodeState } from "../markdown/code-spans.js";
import { formatAssistantErrorText } from "./pi-embedded-helpers.js";
import { isAssistantMessage } from "./pi-embedded-utils.js";

export {
  handleAutoCompactionEnd,
  handleAutoCompactionStart,
} from "./pi-embedded-subscribe.handlers.compaction.js";

export function handleAgentStart(ctx: EmbeddedPiSubscribeContext) {
  ctx.log.debug(`embedded run agent start: runId=${ctx.params.runId}`);
  emitAgentEvent({
    runId: ctx.params.runId,
    stream: "lifecycle",
    data: {
      phase: "start",
      startedAt: Date.now(),
    },
  });
  void ctx.params.onAgentEvent?.({
    stream: "lifecycle",
    data: { phase: "start" },
  });
}

export function handleAgentEnd(ctx: EmbeddedPiSubscribeContext) {
  const lastAssistant = ctx.state.lastAssistant;
  const isError = isAssistantMessage(lastAssistant) && lastAssistant.stopReason === "error";

  if (isError && lastAssistant) {
    const friendlyError = formatAssistantErrorText(lastAssistant, {
      cfg: ctx.params.config,
      sessionKey: ctx.params.sessionKey,
      provider: lastAssistant.provider,
      model: lastAssistant.model,
    });
    const errorText = (friendlyError || lastAssistant.errorMessage || "LLM request failed.").trim();
    ctx.log.warn(
      `embedded run agent end: runId=${ctx.params.runId} isError=true error=${errorText}`,
    );
    emitAgentEvent({
      runId: ctx.params.runId,
      stream: "lifecycle",
      data: {
        phase: "error",
        error: errorText,
        endedAt: Date.now(),
      },
    });
    void ctx.params.onAgentEvent?.({
      stream: "lifecycle",
      data: {
        phase: "error",
        error: errorText,
      },
    });
  } else {
    ctx.log.debug(`embedded run agent end: runId=${ctx.params.runId} isError=${isError}`);
    const usageTotals = ctx.getUsageTotals();
    const endModel =
      isAssistantMessage(ctx.state.lastAssistant) ? (ctx.state.lastAssistant.model ?? "") : "";
    const endProvider =
      isAssistantMessage(ctx.state.lastAssistant) ? (ctx.state.lastAssistant.provider ?? "") : "";
    emitAgentEvent({
      runId: ctx.params.runId,
      sessionKey: ctx.params.sessionKey,
      stream: "lifecycle",
      data: {
        phase: "end",
        endedAt: Date.now(),
        ...(usageTotals && {
          usage: usageTotals,
          model: endModel,
          provider: endProvider,
        }),
      },
    });
    void ctx.params.onAgentEvent?.({
      stream: "lifecycle",
      data: { phase: "end" },
    });

    // Deduct LLM usage from bot wallet — runs in-process (gateway or cloud pod).
    // This is the canonical deduction point; it fires wherever the agent actually
    // ran, so it works for both local gateway runs and remote cloud-agent pods.
    if (usageTotals && ctx.params.sessionKey) {
      void deductBotWalletUsage(ctx.params.sessionKey, usageTotals, endModel, endProvider);
    }
  }

  ctx.flushBlockReplyBuffer();
  // Flush the reply pipeline so the response reaches the channel before
  // compaction wait blocks the run.  This mirrors the pattern used by
  // handleToolExecutionStart and ensures delivery is not held hostage to
  // long-running compaction (#35074).
  void ctx.params.onBlockReplyFlush?.();

  ctx.state.blockState.thinking = false;
  ctx.state.blockState.final = false;
  ctx.state.blockState.inlineCode = createInlineCodeState();

  if (ctx.state.pendingCompactionRetry > 0) {
    ctx.resolveCompactionRetry();
  } else {
    ctx.maybeResolveCompactionWait();
  }
}

/** Extract bot ID from session key (e.g. "agent:cloud-xxxx:main" → "cloud-xxxx"). */
function extractBotIdFromSessionKey(sessionKey: string): string {
  const parts = sessionKey.split(":");
  if (parts.length >= 2 && parts[0] === "agent") {
    return parts[1] ?? "";
  }
  return parts[1] ?? parts[0] ?? "";
}

/** Deduct LLM token cost from the bot wallet. Fire-and-forget — never throws. */
async function deductBotWalletUsage(
  sessionKey: string,
  usageTotals: { input?: number; output?: number; cacheRead?: number; cacheWrite?: number },
  model: string,
  provider: string,
): Promise<void> {
  try {
    const botId = extractBotIdFromSessionKey(sessionKey);
    if (!botId) {
      return;
    }
    const inputTok = usageTotals.input ?? 0;
    const outputTok = usageTotals.output ?? 0;
    if (inputTok <= 0 && outputTok <= 0) {
      return;
    }
    const cacheRead = usageTotals.cacheRead ?? 0;
    const cacheWrite = usageTotals.cacheWrite ?? 0;

    const { resolveModelCostConfig, estimateUsageCost } = await import(
      "../utils/usage-format.js"
    );
    let cfg: import("../config/config.js").BotConfig | undefined;
    try {
      cfg = (await import("../config/config.js")).loadConfig();
    } catch {
      /* no config */
    }
    let costConfig = resolveModelCostConfig({ provider, model, config: cfg });
    if (!costConfig) {
      // Apply Claude model pricing regardless of provider (hanzo, anthropic, openai-compat, etc.)
      const m = model.toLowerCase();
      if (m.includes("opus")) {
        costConfig = { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 };
      } else if (m.includes("haiku")) {
        costConfig = { input: 0.8, output: 4, cacheRead: 0.08, cacheWrite: 1 };
      } else if (m.includes("claude") || m.includes("sonnet") || provider === "anthropic" || provider === "hanzo") {
        // sonnet / default Claude rate
        costConfig = { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 };
      }
    }
    const costUsd = estimateUsageCost({
      usage: { input: inputTok, output: outputTok, cacheRead, cacheWrite },
      cost: costConfig,
    });
    const costCents = costUsd ? Math.ceil(costUsd * 100) : 0;
    if (costCents <= 0) {
      return;
    }

    const { deductWalletUsage } = await import("../gateway/billing/iam-billing-client.js");
    await deductWalletUsage({
      botId,
      amountUsdCents: costCents,
      model,
      provider,
      inputTokens: inputTok,
      outputTokens: outputTok,
      cacheReadTokens: cacheRead,
      cacheWriteTokens: cacheWrite,
    });
  } catch {
    // Best-effort — never block agent teardown
  }
}
