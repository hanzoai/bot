// LongCat plugin entrypoint registers its Bot integration.
import { defineSingleProviderPluginEntry } from "bot/plugin-sdk/provider-entry";
import { buildProviderReplayFamilyHooks } from "bot/plugin-sdk/provider-model-shared";
import { buildProviderToolCompatFamilyHooks } from "bot/plugin-sdk/provider-tools";
import { LONGCAT_DEFAULT_MODEL_REF } from "./models.js";
import { applyLongCatConfig } from "./onboard.js";
import manifest from "./bot.plugin.json" with { type: "json" };
import { createLongCatThinkingWrapper } from "./stream.js";

const PROVIDER_ID = "longcat";

export default defineSingleProviderPluginEntry({
  id: PROVIDER_ID,
  name: "LongCat Provider",
  description: "Official LongCat provider plugin",
  manifest,
  provider: {
    label: "LongCat",
    docsPath: "/providers/longcat",
    aliases: ["meituan-longcat"],
    manifestAuth: {
      defaultModel: LONGCAT_DEFAULT_MODEL_REF,
      applyConfig: applyLongCatConfig,
      noteTitle: "LongCat",
      noteMessage: "Manage API keys at https://longcat.chat/platform/api_keys",
    },
    catalog: { liveModelDiscovery: true },
    ...buildProviderReplayFamilyHooks({
      family: "openai-compatible",
      dropReasoningFromHistory: false,
    }),
    ...buildProviderToolCompatFamilyHooks("openai"),
    wrapStreamFn: (ctx) => createLongCatThinkingWrapper(ctx.streamFn, ctx.thinkingLevel),
  },
});
