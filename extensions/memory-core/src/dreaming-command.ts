// Memory Core plugin module implements dreaming command behavior.
import type { BotConfig } from "bot/plugin-sdk/config-contracts";
import { resolveMemoryDreamingConfig } from "bot/plugin-sdk/memory-core-host-status";
import type { BotPluginApi, PluginCommandContext } from "bot/plugin-sdk/plugin-entry";
import { normalizeLowercaseStringOrEmpty } from "bot/plugin-sdk/string-coerce-runtime";
import { asRecord } from "./dreaming-shared.js";
import { resolveShortTermPromotionDreamingConfig } from "./dreaming.js";

function resolveDreamingPluginConfig(cfg: BotConfig): Record<string, unknown> {
  const entry = asRecord(cfg.plugins?.entries?.["memory-core"]);
  return asRecord(entry?.config) ?? {};
}

function updateDreamingEnabledInConfig(cfg: BotConfig, enabled: boolean): BotConfig {
  const entries = { ...cfg.plugins?.entries };
  const existingEntry = asRecord(entries["memory-core"]) ?? {};
  const existingConfig = asRecord(existingEntry.config) ?? {};
  const existingSleep = asRecord(existingConfig.dreaming) ?? {};
  entries["memory-core"] = {
    ...existingEntry,
    config: {
      ...existingConfig,
      dreaming: {
        ...existingSleep,
        enabled,
      },
    },
  };

  return {
    ...cfg,
    plugins: {
      ...cfg.plugins,
      entries,
    },
  };
}

function formatEnabled(value: boolean): string {
  return value ? "on" : "off";
}

function formatPhaseGuide(): string {
  return [
    "- implementation detail: each sweep runs light -> REM -> deep.",
    "- deep is the only stage that writes durable entries to MEMORY.md.",
    "- DREAMS.md is for human-readable dreaming summaries and diary entries.",
  ].join("\n");
}

function formatStatus(cfg: BotConfig): string {
  const pluginConfig = resolveDreamingPluginConfig(cfg);
  const dreaming = resolveMemoryDreamingConfig({
    pluginConfig,
    cfg,
  });
  const deep = resolveShortTermPromotionDreamingConfig({ pluginConfig, cfg });
  const timezone = dreaming.timezone ? ` (${dreaming.timezone})` : "";

  return [
    "Dreaming status:",
    `- enabled: ${formatEnabled(dreaming.enabled)}${timezone}`,
    `- sweep cadence: ${dreaming.frequency}`,
    `- promotion policy: score>=${deep.minScore}, recalls>=${deep.minRecallCount}, uniqueQueries>=${deep.minUniqueQueries}`,
  ].join("\n");
}

function formatUsage(includeStatus: string): string {
  return [
    "Usage: /dreaming status",
    "Usage: /dreaming on|off",
    "",
    includeStatus,
    "",
    "Phases:",
    formatPhaseGuide(),
  ].join("\n");
}

function lacksAdminOrOwnerForDreamingMutation(params: {
  gatewayClientScopes?: readonly string[];
  senderIsOwner?: boolean;
}): boolean {
  if (Array.isArray(params.gatewayClientScopes)) {
    return !params.gatewayClientScopes.includes("operator.admin");
  }
  return params.senderIsOwner !== true;
}

export async function handleDreamingCommand(api: BotPluginApi, ctx: PluginCommandContext) {
  const args = ctx.args?.trim() ?? "";
  const [firstToken = ""] = args
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => normalizeLowercaseStringOrEmpty(token));
  const currentConfig = api.runtime.config.current() as BotConfig;

  if (!firstToken || firstToken === "help" || firstToken === "options" || firstToken === "phases") {
    return { text: formatUsage(formatStatus(currentConfig)) };
  }

  if (firstToken === "status") {
    return { text: formatStatus(currentConfig) };
  }

  if (firstToken === "on" || firstToken === "off") {
    if (
      lacksAdminOrOwnerForDreamingMutation({
        gatewayClientScopes: ctx.gatewayClientScopes,
        senderIsOwner: ctx.senderIsOwner,
      })
    ) {
      return {
        text: "⚠️ /dreaming on|off requires owner status for channel callers or operator.admin for gateway clients.",
      };
    }
    const enabled = firstToken === "on";
    const committed = await api.runtime.config.mutateConfigFile({
      afterWrite: { mode: "auto" },
      mutate: (draft) => {
        const nextConfig = updateDreamingEnabledInConfig(draft, enabled);
        Object.assign(draft, nextConfig);
      },
    });
    return {
      text: [
        `Dreaming ${enabled ? "enabled" : "disabled"}.`,
        "",
        formatStatus(committed.nextConfig),
      ].join("\n"),
    };
  }

  return { text: formatUsage(formatStatus(currentConfig)) };
}
