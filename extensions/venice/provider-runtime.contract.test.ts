// Venice tests cover provider runtime.contract plugin behavior.
import { describeVeniceProviderRuntimeContract } from "bot/plugin-sdk/provider-test-contracts";
import manifest from "./bot.plugin.json" with { type: "json" };

describeVeniceProviderRuntimeContract(
  () => import("./index.js"),
  manifest.modelCatalog.providers.venice,
);
