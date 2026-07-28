// Qa Lab plugin module implements model selection behavior.
import {
  listProfilesForProvider,
  loadAuthProfileStoreForRuntime,
} from "bot/plugin-sdk/agent-runtime";
import { resolveEnvApiKey } from "bot/plugin-sdk/provider-auth";

const QA_CODEX_OAUTH_LIVE_MODEL = "openai/gpt-5.6-luna";

export function resolveQaLiveFrontierPreferredModel() {
  if (resolveEnvApiKey("openai")?.apiKey) {
    return undefined;
  }
  try {
    const store = loadAuthProfileStoreForRuntime(undefined, {
      readOnly: true,
      allowKeychainPrompt: false,
      externalCliProviderIds: ["openai"],
    });
    const openAiProfileIds = listProfilesForProvider(store, "openai");
    const openAiProfileTypes = openAiProfileIds.map((profileId) => store.profiles[profileId]?.type);
    if (openAiProfileTypes.some((type) => type === "api_key")) {
      return undefined;
    }
    return openAiProfileTypes.some((type) => type === "oauth" || type === "token")
      ? QA_CODEX_OAUTH_LIVE_MODEL
      : undefined;
  } catch {
    return undefined;
  }
}
