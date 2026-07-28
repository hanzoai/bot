// Image Generation Core API module exposes the plugin public contract.
export type { AuthProfileStore } from "bot/plugin-sdk/image-generation-core";
export {
  buildNoCapabilityModelConfiguredMessage,
  createSubsystemLogger,
  describeFailoverError,
  getImageGenerationProvider,
  getProviderEnvVars,
  isFailoverError,
  listImageGenerationProviders,
  normalizeGoogleModelId,
  OPENAI_DEFAULT_IMAGE_MODEL,
  parseImageGenerationModelRef,
  resolveAgentModelFallbackValues,
  resolveAgentModelPrimaryValue,
  resolveApiKeyForProvider,
  resolveCapabilityModelCandidates,
  throwCapabilityGenerationFailure,
} from "bot/plugin-sdk/image-generation-core";
export type {
  FallbackAttempt,
  GeneratedImageAsset,
  ImageGenerationProvider,
  ImageGenerationProviderConfiguredContext,
  ImageGenerationProviderPlugin,
  ImageGenerationRequest,
  ImageGenerationResolution,
  ImageGenerationResult,
  ImageGenerationSourceImage,
  BotConfig,
} from "bot/plugin-sdk/image-generation-core";
