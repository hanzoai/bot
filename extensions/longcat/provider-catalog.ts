// LongCat provider module implements model/runtime integration.
import { buildManifestModelProviderConfig } from "bot/plugin-sdk/provider-catalog-shared";
import type { ModelProviderConfig } from "bot/plugin-sdk/provider-model-shared";
import manifest from "./bot.plugin.json" with { type: "json" };

export function buildLongCatProvider(): ModelProviderConfig {
  return buildManifestModelProviderConfig({
    providerId: "longcat",
    catalog: manifest.modelCatalog.providers.longcat,
  });
}
