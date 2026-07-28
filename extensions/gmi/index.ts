// Gmi plugin entrypoint registers its Bot integration.
import { readConfiguredProviderCatalogEntries } from "bot/plugin-sdk/provider-catalog-shared";
import { defineSingleProviderPluginEntry } from "bot/plugin-sdk/provider-entry";
import { buildProviderReplayFamilyHooks } from "bot/plugin-sdk/provider-model-shared";
import { buildProviderToolCompatFamilyHooks } from "bot/plugin-sdk/provider-tools";
import manifest from "./bot.plugin.json" with { type: "json" };
import { buildGmiProvider } from "./provider-catalog.js";

const PROVIDER_ID = "gmi";

export default defineSingleProviderPluginEntry({
  id: PROVIDER_ID,
  name: "GMI Cloud Provider",
  description: "GMI Cloud provider plugin",
  manifest,
  provider: {
    label: "GMI Cloud",
    docsPath: "/providers/gmi",
    aliases: ["gmi-cloud", "gmicloud"],
    manifestAuth: {
      noteTitle: "GMI Cloud",
      noteMessage: "Manage API keys at https://www.gmicloud.ai/",
    },
    catalog: {
      buildProvider: buildGmiProvider,
      buildStaticProvider: buildGmiProvider,
      allowExplicitBaseUrl: true,
      liveModelDiscovery: true,
    },
    augmentModelCatalog: ({ config }) =>
      readConfiguredProviderCatalogEntries({
        config,
        providerId: PROVIDER_ID,
      }),
    ...buildProviderReplayFamilyHooks({
      family: "openai-compatible",
      dropReasoningFromHistory: false,
    }),
    ...buildProviderToolCompatFamilyHooks("openai"),
  },
});
