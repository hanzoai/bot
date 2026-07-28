// Mattermost plugin module implements secret input behavior.
export type { SecretInput } from "bot/plugin-sdk/secret-input";
export {
  buildSecretInputSchema,
  hasConfiguredSecretInput,
  normalizeResolvedSecretInputString,
  normalizeSecretInputString,
} from "bot/plugin-sdk/secret-input";
