// Mattermost plugin module implements secret input behavior.
export type { SecretInput } from "bot/plugin-sdk/secret-input";
export {
  buildSecretInputSchema,
  hasConfiguredSecretInput,
  resolveSecretInputString,
} from "bot/plugin-sdk/secret-input";
export type { SecretInputStringResolutionMode } from "bot/plugin-sdk/secret-input";
